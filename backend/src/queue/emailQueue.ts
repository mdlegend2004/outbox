import { Queue } from "bullmq";
import { env } from "../config/env";
import { createRedis } from "../lib/redis";

export const EMAIL_QUEUE = "email-send";
export const SEND_JOB = "send-email";

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 30_000 },
    // Keep history for the dashboard, but bounded.
    removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
    removeOnFail: { age: 14 * 24 * 3600 },
  },
});

/** The BullMQ job id is the email id → enqueueing the same email twice is a no-op. */
export function jobIdFor(emailId: string) {
  return `email-${emailId}`;
}

export interface EnqueueItem {
  id: string;
  scheduledAt: Date;
}

const BULK_CHUNK = 500;

export async function enqueueEmails(items: EnqueueItem[]) {
  const now = Date.now();
  for (let i = 0; i < items.length; i += BULK_CHUNK) {
    const chunk = items.slice(i, i + BULK_CHUNK);
    await emailQueue.addBulk(
      chunk.map((e) => ({
        name: SEND_JOB,
        data: { emailId: e.id },
        opts: { jobId: jobIdFor(e.id), delay: Math.max(0, e.scheduledAt.getTime() - now) },
      })),
    );
  }
}
