import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { emailQueue, enqueueEmails, jobIdFor } from "../queue/emailQueue";
import { indexEmails, toDoc } from "./search";
import { scheduleTimes } from "../lib/time";

export interface CreateCampaignInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
}

export async function createCampaign(input: CreateCampaignInput) {
  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const times = scheduleTimes(input.startAt, recipients.length, input.delayMs);

  const sender = await prisma.sender.findUniqueOrThrow({ where: { id: input.senderId } });

  // 1. Persist first (source of truth). Queue jobs only reference email ids.
  const { campaign, emails } = await prisma.$transaction(
    async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          userId: input.userId,
          senderId: input.senderId,
          subject: input.subject,
          body: input.body,
          startAt: input.startAt,
          delayMs: input.delayMs,
          hourlyLimit: input.hourlyLimit,
          totalCount: recipients.length,
        },
      });
      await tx.email.createMany({
        data: recipients.map((to, i) => ({
          campaignId: campaign.id,
          userId: input.userId,
          senderId: input.senderId,
          seq: i,
          toEmail: to,
          subject: input.subject,
          scheduledAt: times[i],
        })),
      });
      const emails = await tx.email.findMany({ where: { campaignId: campaign.id }, orderBy: { seq: "asc" } });
      return { campaign, emails };
    },
    { timeout: 60_000 },
  );

  // 2. Enqueue delayed jobs. If this crashes midway, startup reconciliation
  //    re-enqueues whatever is missing (jobIds are deterministic → no dupes).
  await enqueueEmails(emails);

  // 3. Make them searchable (best-effort).
  await indexEmails(emails.map((e) => toDoc(e, sender, input.body)));

  logger.info("Campaign scheduled", { campaignId: campaign.id, count: emails.length });
  return { campaign, count: emails.length, firstAt: times[0], lastAt: times[times.length - 1] };
}

/** A 'sending' row older than this is assumed to belong to a crashed worker. */
export const STALE_LOCK_MS = 5 * 60 * 1000;

/**
 * Startup safety net (runs in every worker on boot):
 *  - emails stuck in `sending` because a worker died mid-send go back to `scheduled`
 *  - every `scheduled` email must have a queue job; missing ones (e.g. Redis
 *    was flushed, or the API crashed between DB commit and enqueue) are re-added
 *    with their ORIGINAL scheduledAt, so nothing restarts from scratch.
 * Existing jobs are untouched because job ids are deterministic.
 */
export async function reconcileQueue() {
  const stale = await prisma.email.updateMany({
    where: { status: "sending", lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
    data: { status: "scheduled", lockedAt: null },
  });
  if (stale.count) logger.warn("Recovered emails stuck in 'sending'", { count: stale.count });

  let cursor: string | undefined;
  let requeued = 0;
  for (;;) {
    const batch = await prisma.email.findMany({
      where: { status: "scheduled" },
      select: { id: true, scheduledAt: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;

    const states = await Promise.all(batch.map((e) => emailQueue.getJobState(jobIdFor(e.id))));
    // 'completed'/'failed' jobs for a still-`scheduled` row mean the job ended without
    // finishing the email (e.g. DB write lost) → remove and re-add so it runs again.
    const missing: typeof batch = [];
    for (const [i, state] of states.entries()) {
      if (state === "unknown") missing.push(batch[i]);
      else if (state === "completed" || state === "failed") {
        await emailQueue.remove(jobIdFor(batch[i].id));
        missing.push(batch[i]);
      }
    }
    if (missing.length) {
      await enqueueEmails(missing);
      requeued += missing.length;
    }
  }
  logger.info("Queue reconciliation finished", { requeued });
}

export function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
