import { env } from "./config/env";
import { createApp } from "./app";
import { logger, errMessage } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { ensureSenders } from "./services/mailer";
import { ensureEmailIndex } from "./services/search";

async function main() {
  await prisma.$connect();
  await ensureSenders();
  await ensureEmailIndex();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
    logger.info(`Bull Board at http://localhost:${env.PORT}/admin/queues`);
  });

  const shutdown = () => server.close(() => prisma.$disconnect().then(() => process.exit(0)));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("API failed to start", { error: errMessage(err) });
  process.exit(1);
});
