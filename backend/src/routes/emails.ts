import { Router } from "express";
import { z } from "zod";
import type { EmailStatus, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger, errMessage } from "../lib/logger";
import { asyncHandler, HttpError } from "../middleware/errors";
import { requireAuth, userIdOf } from "../middleware/auth";
import { createCampaign, isUniqueViolation } from "../services/scheduler";
import { searchEmails } from "../services/search";

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const MAX_RECIPIENTS = 10_000;

// ---------- Senders ----------
emailsRouter.get(
  "/senders",
  asyncHandler(async (_req, res) => {
    const senders = await prisma.sender.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ senders });
  }),
);

// ---------- Schedule ----------
const scheduleSchema = z.object({
  senderId: z.string().min(1),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().min(1, "Body is required").max(100_000),
  recipients: z.array(z.string().trim().email()).min(1, "Add at least one recipient").max(MAX_RECIPIENTS),
  /** ISO timestamp; omitted or in the past = start now */
  startAt: z.string().datetime({ offset: true }).optional(),
  delaySeconds: z.coerce.number().int().min(0).max(24 * 3600).default(0),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000).optional(),
});

emailsRouter.post(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const sender = await prisma.sender.findUnique({ where: { id: input.senderId } });
    if (!sender) throw new HttpError(400, "Unknown sender");

    const requested = input.startAt ? new Date(input.startAt) : new Date();
    const startAt = requested.getTime() < Date.now() ? new Date() : requested;
    try {
      const result = await createCampaign({
        userId: userIdOf(req),
        senderId: sender.id,
        subject: input.subject,
        body: input.body,
        recipients: input.recipients,
        startAt,
        delayMs: input.delaySeconds * 1000,
        hourlyLimit: input.hourlyLimit ?? env.DEFAULT_CAMPAIGN_HOURLY_LIMIT,
      });
      res.status(201).json({
        campaignId: result.campaign.id,
        scheduled: result.count,
        firstAt: result.firstAt,
        lastAt: result.lastAt,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, "Duplicate recipients in campaign");
      throw err;
    }
  }),
);

// ---------- Listing ----------
const TAB_STATUSES: Record<string, EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent", "failed"],
};

const listSchema = z.object({
  tab: z.enum(["scheduled", "sent"]).default("scheduled"),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const emailInclude = {
  sender: { select: { name: true, email: true } },
  campaign: { select: { body: true } },
} satisfies Prisma.EmailInclude;

type EmailRow = Prisma.EmailGetPayload<{ include: typeof emailInclude }>;

const snippet = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

function serialize(e: EmailRow, withBody = false) {
  return {
    id: e.id,
    campaignId: e.campaignId,
    toEmail: e.toEmail,
    subject: e.subject,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    attempts: e.attempts,
    rescheduleCount: e.rescheduleCount,
    lastError: e.lastError,
    previewUrl: e.previewUrl,
    from: e.sender,
    snippet: snippet(e.campaign.body),
    ...(withBody ? { body: e.campaign.body } : {}),
  };
}

emailsRouter.get(
  "/emails",
  asyncHandler(async (req, res) => {
    const { tab, q, page, pageSize } = listSchema.parse(req.query);
    const userId = userIdOf(req);
    const statuses = TAB_STATUSES[tab];
    const orderBy: Prisma.EmailOrderByWithRelationInput =
      tab === "scheduled" ? { scheduledAt: "asc" } : { sentAt: "desc" };

    if (q) {
      // Full-text search goes through Elasticsearch; rows are hydrated from Postgres
      // so the response always reflects the current source of truth.
      try {
        const { ids, total } = await searchEmails({
          userId,
          q,
          statuses,
          from: (page - 1) * pageSize,
          size: pageSize,
        });
        const rows = await prisma.email.findMany({ where: { id: { in: ids }, userId }, include: emailInclude });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const items = ids.map((id) => byId.get(id)).filter((r): r is EmailRow => Boolean(r));
        return res.json({ items: items.map((e) => serialize(e)), total, page, pageSize, source: "elasticsearch" });
      } catch (err) {
        logger.warn("Search failed, falling back to DB filter", { error: errMessage(err) });
        const where: Prisma.EmailWhereInput = {
          userId,
          status: { in: statuses },
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { toEmail: { contains: q, mode: "insensitive" } },
          ],
        };
        const [items, total] = await Promise.all([
          prisma.email.findMany({ where, include: emailInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
          prisma.email.count({ where }),
        ]);
        return res.json({ items: items.map((e) => serialize(e)), total, page, pageSize, source: "database" });
      }
    }

    const where: Prisma.EmailWhereInput = { userId, status: { in: statuses } };
    const [items, total] = await Promise.all([
      prisma.email.findMany({ where, include: emailInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.email.count({ where }),
    ]);
    res.json({ items: items.map((e) => serialize(e)), total, page, pageSize, source: "database" });
  }),
);

emailsRouter.get(
  "/emails/stats",
  asyncHandler(async (req, res) => {
    const groups = await prisma.email.groupBy({
      by: ["status"],
      where: { userId: userIdOf(req) },
      _count: { _all: true },
    });
    const count = (s: EmailStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
    res.json({
      scheduled: count("scheduled") + count("sending"),
      sent: count("sent") + count("failed"),
      failed: count("failed"),
    });
  }),
);

emailsRouter.get(
  "/emails/:id",
  asyncHandler(async (req, res) => {
    const email = await prisma.email.findFirst({
      where: { id: req.params.id, userId: userIdOf(req) },
      include: emailInclude,
    });
    if (!email) throw new HttpError(404, "Email not found");
    res.json({ email: serialize(email, true) });
  }),
);
