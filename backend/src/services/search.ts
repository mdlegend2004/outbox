import { Client } from "@elastic/elasticsearch";
import type { Email, Sender } from "@prisma/client";
import { env } from "../config/env";
import { logger, errMessage } from "../lib/logger";

export const EMAIL_INDEX = "emails";

export const es = new Client({ node: env.ELASTICSEARCH_URL });

export interface EmailDoc {
  id: string;
  userId: string;
  campaignId: string;
  toEmail: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  lastError: string | null;
}

export async function ensureEmailIndex() {
  try {
    const exists = await es.indices.exists({ index: EMAIL_INDEX });
    if (exists) return;
    await es.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        properties: {
          id: { type: "keyword" },
          userId: { type: "keyword" },
          campaignId: { type: "keyword" },
          toEmail: { type: "text", fields: { raw: { type: "keyword" } } },
          fromEmail: { type: "text", fields: { raw: { type: "keyword" } } },
          fromName: { type: "text" },
          subject: { type: "text" },
          body: { type: "text" },
          status: { type: "keyword" },
          scheduledAt: { type: "date" },
          sentAt: { type: "date" },
          lastError: { type: "text" },
        },
      },
    });
    logger.info("Created Elasticsearch index", { index: EMAIL_INDEX });
  } catch (err) {
    logger.warn("Elasticsearch unavailable – search indexing disabled until it comes back", {
      error: errMessage(err),
    });
  }
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function toDoc(email: Email, sender: Pick<Sender, "email" | "name">, body: string): EmailDoc {
  return {
    id: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    toEmail: email.toEmail,
    fromEmail: sender.email,
    fromName: sender.name,
    subject: email.subject,
    body: stripHtml(body),
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt?.toISOString() ?? null,
    lastError: email.lastError,
  };
}

/**
 * Indexing is best-effort: Postgres is the source of truth, so an ES outage
 * must never block scheduling or sending.
 */
export async function indexEmails(docs: EmailDoc[]) {
  if (!docs.length) return;
  try {
    for (let i = 0; i < docs.length; i += 1000) {
      const chunk = docs.slice(i, i + 1000);
      const res = await es.bulk({
        operations: chunk.flatMap((d) => [{ index: { _index: EMAIL_INDEX, _id: d.id } }, d]),
      });
      if (res.errors) logger.warn("Some documents failed to index", { count: chunk.length });
    }
  } catch (err) {
    logger.warn("Elasticsearch bulk index failed", { error: errMessage(err) });
  }
}

export async function updateEmailDoc(id: string, patch: Partial<EmailDoc>) {
  try {
    await es.update({ index: EMAIL_INDEX, id, doc: patch, doc_as_upsert: false, retry_on_conflict: 3 });
  } catch (err) {
    logger.warn("Elasticsearch update failed", { id, error: errMessage(err) });
  }
}

const SEARCH_FIELDS = ["subject^3", "toEmail^2", "body", "fromEmail", "fromName"];

export async function searchEmails(opts: {
  userId: string;
  q: string;
  statuses?: string[];
  from: number;
  size: number;
}) {
  const res = await es.search<EmailDoc>({
    index: EMAIL_INDEX,
    from: opts.from,
    size: opts.size,
    query: {
      bool: {
        filter: [
          { term: { userId: opts.userId } },
          ...(opts.statuses?.length ? [{ terms: { status: opts.statuses } }] : []),
        ],
        // typo-tolerant full words OR search-as-you-type prefixes
        should: [
          { multi_match: { query: opts.q, fields: SEARCH_FIELDS, fuzziness: "AUTO" } },
          { multi_match: { query: opts.q, fields: SEARCH_FIELDS, type: "phrase_prefix" } },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [{ _score: { order: "desc" } }, { scheduledAt: { order: "desc" } }],
  });
  const total = typeof res.hits.total === "number" ? res.hits.total : res.hits.total?.value ?? 0;
  return { ids: res.hits.hits.map((h) => h._id as string), total };
}
