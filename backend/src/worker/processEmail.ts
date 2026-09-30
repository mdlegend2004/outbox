import { DelayedError, Job } from "bullmq";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger, errMessage } from "../lib/logger";
import type { EmailJobData } from "../queue/emailQueue";
import { sendEmail } from "../services/mailer";
import {
  LimitScope,
  nextWindowRunAt,
  releaseSlot,
  reserveSendGap,
  reserveSlot,
  shouldNotifyLimit,
} from "../services/rateLimiter";
import { updateEmailDoc } from "../services/search";
import { notifySlack, rateLimitMessage } from "../services/slack";
import { STALE_LOCK_MS } from "../services/scheduler";
import { hourWindow, windowStart } from "../lib/time";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Loaded = NonNullable<Awaited<ReturnType<typeof loadEmail>>>;

function loadEmail(id: string) {
  return prisma.email.findUnique({ where: { id }, include: { sender: true, campaign: true } });
}

/** Re-run this job later without consuming a retry attempt. */
async function deferJob(job: Job, token: string | undefined, runAt: number): Promise<never> {
  await job.moveToDelayed(runAt, token);
  throw new DelayedError();
}

async function notifyLimit(email: Loaded, scope: LimitScope, window: number, resumeAt: number) {
  const scopeId = scope === "sender" ? email.senderId : email.campaignId;
  if (!(await shouldNotifyLimit(scope, scopeId, window))) return;
  const limit = scope === "sender" ? env.MAX_EMAILS_PER_HOUR_PER_SENDER : email.campaign.hourlyLimit;
  const msg = rateLimitMessage({
    scope,
    senderEmail: email.sender.email,
    subject: email.campaign.subject,
    limit,
    resumeAt: new Date(resumeAt),
  });
  const delivered = await notifySlack(email.userId, msg.text, msg.blocks);
  logger.warn("Hourly limit reached", { scope, scopeId, limit, slackNotified: delivered });
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;
  const email = await loadEmail(emailId);

  // ---- Idempotency guard 1: terminal states are never re-sent ----
  if (!email) return { skipped: "missing" };
  if (email.status === "sent" || email.status === "failed") return { skipped: email.status };

  // SMTP already accepted this email but the DB commit didn't land → just finalise.
  const marker = await redis.get(sentMarkerKey(email.id));
  if (marker) {
    await markSent(email.id, JSON.parse(marker));
    return { recovered: true };
  }

  // Another worker is mid-send (or crashed mid-send). Check back once its lock
  // would be considered stale instead of sending a second copy now.
  if (email.status === "sending") {
    const lockAge = Date.now() - (email.lockedAt?.getTime() ?? 0);
    if (lockAge < STALE_LOCK_MS) return deferJob(job, token, Date.now() + STALE_LOCK_MS - lockAge + 1000);
  }

  // ---- Hourly limits (Redis counters, atomic across workers) ----
  const now = Date.now();
  const slot = await reserveSlot(email.senderId, email.campaignId, email.campaign.hourlyLimit, now);
  if (!slot.ok) {
    const scopeId = slot.scope === "sender" ? email.senderId : email.campaignId;
    const runAt = await nextWindowRunAt(slot.scope, scopeId, now);
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { scheduledAt: new Date(runAt), rescheduleCount: { increment: 1 } },
    });
    await updateEmailDoc(email.id, { scheduledAt: updated.scheduledAt.toISOString() });
    await notifyLimit(email, slot.scope, slot.window, runAt);
    logger.info("Rate limited → moved to next window", { emailId, scope: slot.scope, runAt: new Date(runAt) });
    return deferJob(job, token, runAt);
  }
  // This send is the one that *reaches* a limit → alert right now, not on the next job.
  const resumeAt = windowStart(hourWindow(now) + 1);
  if (slot.senderCount >= env.MAX_EMAILS_PER_HOUR_PER_SENDER) await notifyLimit(email, "sender", slot.window, resumeAt);
  if (slot.campaignCount >= email.campaign.hourlyLimit) await notifyLimit(email, "campaign", slot.window, resumeAt);

  // ---- Per-sender pacing: wait for this sender's next free send slot ----
  // (BullMQ keeps renewing the job lock while we wait.)
  const waitMs = await reserveSendGap(email.senderId);
  if (waitMs > 0) await sleep(waitMs);

  // ---- Idempotency guard 2: atomic claim (compare-and-set on status) ----
  const claimed = await prisma.email.updateMany({
    where: {
      id: email.id,
      OR: [
        { status: "scheduled" },
        { status: "sending", lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
      ],
    },
    data: { status: "sending", lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await releaseSlot(email.senderId, email.campaignId, slot.window);
    return { skipped: "claimed-elsewhere" };
  }

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail(email.sender, {
      emailId: email.id,
      to: email.toEmail,
      subject: email.subject,
      html: email.campaign.body,
    });
  } catch (err) {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const status = finalAttempt ? "failed" : "scheduled";
    await prisma.email.update({
      where: { id: email.id },
      data: { status, lockedAt: null, lastError: errMessage(err) },
    });
    await updateEmailDoc(email.id, { status, lastError: errMessage(err) });
    logger.error("Email send failed", { emailId, finalAttempt, error: errMessage(err) });
    throw err; // BullMQ retries with exponential backoff until attempts are exhausted
  }

  // Record the SMTP success in Redis *before* touching the DB. If the DB write
  // below fails, the retry sees this marker and only finalises the row.
  await redis.set(sentMarkerKey(email.id), JSON.stringify(result), "EX", 7 * 24 * 3600);
  await markSent(email.id, result);
  logger.info("Email sent", { emailId, to: email.toEmail, from: email.sender.email, preview: result.previewUrl });
  return result;
}

const sentMarkerKey = (emailId: string) => `email:sent:${emailId}`;

async function markSent(emailId: string, result: { messageId: string; previewUrl: string | null }) {
  const sentAt = new Date();
  await prisma.email.update({
    where: { id: emailId },
    data: {
      status: "sent",
      sentAt,
      lockedAt: null,
      lastError: null,
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    },
  });
  await updateEmailDoc(emailId, { status: "sent", sentAt: sentAt.toISOString(), lastError: null });
}
