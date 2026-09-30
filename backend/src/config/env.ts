import "dotenv/config";
import { z } from "zod";

const int = (def: number) => z.coerce.number().int().nonnegative().default(def);

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: int(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:5173/api/auth/google/callback"),

  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  SLACK_REDIRECT_URI: z.string().default("http://localhost:5173/api/integrations/slack/callback"),

  ETHEREAL_ACCOUNTS: z.string().default(""),
  ETHEREAL_SENDER_COUNT: int(3),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: int(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  DEFAULT_CAMPAIGN_HOURLY_LIMIT: z.coerce.number().int().positive().default(100),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  BULL_BOARD_USER: z.string().default(""),
  BULL_BOARD_PASSWORD: z.string().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
