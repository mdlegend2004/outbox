import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger, errMessage } from "../lib/logger";

const SLACK_SCOPES = ["incoming-webhook", "chat:write"];

export function slackConfigured() {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

/** Signed, short-lived `state` binds the OAuth round-trip to the logged-in user (CSRF protection). */
export function buildSlackAuthorizeUrl(userId: string) {
  const state = jwt.sign({ uid: userId, purpose: "slack" }, env.JWT_SECRET, { expiresIn: "10m" });
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

export function verifySlackState(state: string): string {
  const payload = jwt.verify(state, env.JWT_SECRET) as { uid: string; purpose: string };
  if (payload.purpose !== "slack") throw new Error("Invalid state");
  return payload.uid;
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { channel: string; url: string };
}

export async function completeSlackOAuth(userId: string, code: string) {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.access_token || !data.team) {
    throw new Error(`Slack OAuth failed: ${data.error ?? "missing incoming_webhook"}`);
  }
  const values = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token,
  };
  return prisma.slackIntegration.upsert({
    where: { userId },
    update: values,
    create: { userId, ...values },
  });
}

export async function disconnectSlack(userId: string) {
  const integ = await prisma.slackIntegration.findUnique({ where: { userId } });
  if (!integ) return;
  // Best effort: revoke the token on Slack's side too.
  try {
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.accessToken}` },
    });
  } catch (err) {
    logger.warn("Slack token revoke failed", { error: errMessage(err) });
  }
  await prisma.slackIntegration.delete({ where: { userId } });
}

/**
 * Post a message to the user's connected channel. The integration is looked
 * up on every call, so connecting/disconnecting takes effect immediately
 * (no restart). Never throws: a Slack problem must not break sending.
 */
export async function notifySlack(userId: string, text: string, blocks?: unknown[]): Promise<boolean> {
  try {
    const integ = await prisma.slackIntegration.findUnique({ where: { userId } });
    if (!integ) return false;
    const res = await fetch(integ.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn("Slack webhook rejected message", { status: res.status, body });
      // Webhook revoked/removed on Slack's side → drop the stale integration.
      if (res.status === 404 || res.status === 403 || body.includes("no_service")) {
        await prisma.slackIntegration.deleteMany({ where: { userId } });
      }
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("Slack notification failed", { error: errMessage(err) });
    return false;
  }
}

export function rateLimitMessage(opts: {
  scope: "sender" | "campaign";
  senderEmail: string;
  subject: string;
  limit: number;
  resumeAt: Date;
}) {
  const who =
    opts.scope === "sender"
      ? `Sender *${opts.senderEmail}* reached its hourly limit of *${opts.limit}* emails.`
      : `Campaign *"${opts.subject}"* reached its hourly limit of *${opts.limit}* emails (sender ${opts.senderEmail}).`;
  const text = `:warning: Rate limit reached — ${who.replace(/\*/g, "")}`;
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: `:warning: *Hourly rate limit reached*\n${who}` } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Remaining emails are queued, not dropped. Sending resumes at <!date^${Math.floor(
            opts.resumeAt.getTime() / 1000,
          )}^{date_short_pretty} {time}|${opts.resumeAt.toISOString()}>.`,
        },
      ],
    },
  ];
  return { text, blocks };
}
