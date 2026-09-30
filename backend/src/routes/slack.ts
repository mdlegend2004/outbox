import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger, errMessage } from "../lib/logger";
import { asyncHandler, HttpError } from "../middleware/errors";
import { requireAuth, userIdOf } from "../middleware/auth";
import {
  buildSlackAuthorizeUrl,
  completeSlackOAuth,
  disconnectSlack,
  notifySlack,
  slackConfigured,
  verifySlackState,
} from "../services/slack";

export const slackRouter = Router();

slackRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const integ = await prisma.slackIntegration.findUnique({ where: { userId: userIdOf(req) } });
    res.json({
      configured: slackConfigured(),
      connected: Boolean(integ),
      teamName: integ?.teamName ?? null,
      channel: integ?.channel ?? null,
    });
  }),
);

// The browser navigates here (full page) → we bounce to Slack's consent screen.
slackRouter.get("/connect", requireAuth, (req, res) => {
  if (!slackConfigured()) throw new HttpError(500, "Slack OAuth is not configured (SLACK_CLIENT_ID/SECRET)");
  res.redirect(buildSlackAuthorizeUrl(userIdOf(req)));
});

// No requireAuth here: the user is identified by the signed `state` (the
// callback may arrive on a tunnel domain where the session cookie isn't sent).
slackRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const back = (status: string) => res.redirect(`${env.FRONTEND_URL}/?slack=${status}`);
    if (error || !code || !state) return back(error === "access_denied" ? "cancelled" : "error");
    try {
      const userId = verifySlackState(state);
      const integ = await completeSlackOAuth(userId, code);
      await notifySlack(
        userId,
        `:white_check_mark: ReachInbox scheduler connected. You'll get an alert in ${integ.channel} whenever a sender hits its hourly limit.`,
      );
      back("connected");
    } catch (err) {
      logger.warn("Slack OAuth callback failed", { error: errMessage(err) });
      back("error");
    }
  }),
);

slackRouter.post(
  "/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ok = await notifySlack(userIdOf(req), ":bell: Test notification from ReachInbox scheduler.");
    if (!ok) throw new HttpError(400, "Slack is not connected");
    res.json({ ok });
  }),
);

slackRouter.delete(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    await disconnectSlack(userIdOf(req));
    res.json({ ok: true });
  }),
);
