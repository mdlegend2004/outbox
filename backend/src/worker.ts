import { Worker } from "bullmq";
import { env } from "./config/env";
import { createRedis, redis } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { logger, errMessage } from "./lib/logger";
import { EMAIL_QUEUE, EmailJobData, emailQueue } from "./queue/emailQueue";
import { processEmailJob } from "./worker/processEmail";
import { reconcileQueue } from "./services/scheduler";
import { ensureEmailIndex } from "./services/search";

async function main() {
  await ensureEmailIndex();
  await reconcileQueue();

  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmailJob, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // A job whose worker died is picked up again after the lock expires.
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  });

  worker.on("failed", (job, err) =>
    logger.warn("Job failed", { jobId: job?.id, attemptsMade: job?.attemptsMade, error: err.message }),
  );
  worker.on("error", (err) => logger.error("Worker error", { error: err.message }));

  logger.info("Email worker started", {
    concurrency: env.WORKER_CONCURRENCY,
    minDelayMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
    maxPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
  });

  // Graceful shutdown: stop taking new jobs, let in-flight sends finish.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received, draining worker…`);
    await worker.close();
    await emailQueue.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Worker failed to start", { error: errMessage(err) });
  process.exit(1);
});
