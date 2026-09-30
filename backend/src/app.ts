import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "./config/env";
import { emailQueue } from "./queue/emailQueue";
import { authRouter } from "./routes/auth";
import { emailsRouter } from "./routes/emails";
import { slackRouter } from "./routes/slack";
import { errorHandler } from "./middleware/errors";

function basicAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.BULL_BOARD_USER || !env.BULL_BOARD_PASSWORD) return next();
  const [user, pass] = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64")
    .toString()
    .split(":");
  if (user === env.BULL_BOARD_USER && pass === env.BULL_BOARD_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="Bull Board"').status(401).send("Authentication required");
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/integrations/slack", slackRouter);
  app.use("/api", emailsRouter);

  // Live queue dashboard
  const board = new ExpressAdapter();
  board.setBasePath("/admin/queues");
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  app.use("/admin/queues", basicAuth, board.getRouter());

  app.use(errorHandler);
  return app;
}
