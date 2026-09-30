import nodemailer, { Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const SENDER_NAMES = ["Oliver Brown", "Amanda Clark", "Ravi Mehta", "Sofia Garcia", "Liam Chen"];

/**
 * Make sure the configured pool of Ethereal senders exists in the DB.
 * Accounts come from ETHEREAL_ACCOUNTS, or are created once through the
 * Ethereal API and then persisted (so restarts reuse the same inboxes).
 */
export async function ensureSenders() {
  const explicit = env.ETHEREAL_ACCOUNTS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.lastIndexOf(":");
      return { user: pair.slice(0, idx), pass: pair.slice(idx + 1) };
    });

  for (const [i, acc] of explicit.entries()) {
    await prisma.sender.upsert({
      where: { email: acc.user },
      update: { smtpPass: acc.pass },
      create: {
        name: SENDER_NAMES[i % SENDER_NAMES.length],
        email: acc.user,
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: acc.user,
        smtpPass: acc.pass,
      },
    });
  }

  const count = await prisma.sender.count();
  for (let i = count; i < env.ETHEREAL_SENDER_COUNT; i++) {
    const acc = await createEtherealAccount();
    await prisma.sender.create({
      data: {
        name: SENDER_NAMES[i % SENDER_NAMES.length],
        email: acc.user,
        smtpHost: acc.smtp.host,
        smtpPort: acc.smtp.port,
        smtpUser: acc.user,
        smtpPass: acc.pass,
      },
    });
    logger.info("Created Ethereal sender", { email: acc.user, web: "https://ethereal.email/login" });
  }
}

/**
 * nodemailer.createTestAccount() memoises the account per process, so it can't
 * create several senders. Call the same Ethereal endpoint directly instead.
 */
async function createEtherealAccount() {
  const res = await fetch("https://api.nodemailer.com/user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestor: "reachinbox-scheduler", version: "1.0.0" }),
  });
  const data = (await res.json()) as {
    status: string;
    error?: string;
    user: string;
    pass: string;
    smtp: { host: string; port: number };
  };
  if (data.status !== "success") throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  return data;
}

const transporters = new Map<string, Transporter>();

function transporterFor(sender: Sender): Transporter {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 2,
    });
    transporters.set(sender.id, t);
  }
  return t;
}

export interface OutgoingEmail {
  emailId: string;
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(sender: Sender, mail: OutgoingEmail) {
  const info = await transporterFor(sender).sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    // Deterministic Message-ID: even in the worst case (crash between SMTP
    // accept and DB commit → retry), receiving servers can dedupe on it.
    messageId: `<${mail.emailId}@scheduler.reachinbox.local>`,
  });
  return {
    messageId: info.messageId as string,
    previewUrl: (nodemailer.getTestMessageUrl(info) || null) as string | null,
  };
}
