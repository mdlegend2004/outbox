import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger, errMessage } from "../lib/logger";
import { asyncHandler, HttpError } from "../middleware/errors";
import { clearSession, requireAuth, setSession, userIdOf } from "../middleware/auth";

export const authRouter = Router();

const google = () => new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

const publicUser = (u: { id: string; email: string; name: string; avatarUrl: string | null }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatarUrl,
});

// Step 1: redirect to Google's consent screen
authRouter.get("/google", (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, "Google OAuth is not configured (GOOGLE_CLIENT_ID)");
  const state = jwt.sign({ purpose: "google" }, env.JWT_SECRET, { expiresIn: "10m" });
  const url = google().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
  res.redirect(url);
});

// Step 2: Google redirects back with ?code → verify ID token → upsert user → session cookie
authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(error);
    if (!code || !state) return fail("missing_code");
    try {
      jwt.verify(state, env.JWT_SECRET);
      const client = google();
      const { tokens } = await client.getToken(code);
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.email || !p.email_verified) return fail("email_not_verified");

      const profile = { name: p.name ?? p.email.split("@")[0], avatarUrl: p.picture ?? null, googleId: p.sub };
      const user = await prisma.user.upsert({
        where: { email: p.email.toLowerCase() },
        update: profile,
        create: { email: p.email.toLowerCase(), ...profile },
      });
      setSession(res, user.id);
      res.redirect(`${env.FRONTEND_URL}/`);
    } catch (err) {
      logger.warn("Google OAuth callback failed", { error: errMessage(err) });
      fail("oauth_failed");
    }
  }),
);

// Email + password (the secondary option on the Figma login screen).
// First login with a new email registers the account.
const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = credsSchema.parse(req.body);
    const normalized = email.toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: normalized, name: normalized.split("@")[0], passwordHash: await bcrypt.hash(password, 10) },
      });
    } else if (!user.passwordHash) {
      throw new HttpError(400, "This account uses Google sign-in");
    } else if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    setSession(res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userIdOf(req) } });
    if (!user) {
      clearSession(res);
      throw new HttpError(401, "User no longer exists");
    }
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
