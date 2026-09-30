import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env";

export const SESSION_COOKIE = "rb_session";
const SESSION_TTL_S = 7 * 24 * 3600;

export interface AuthedRequest extends Request {
  userId: string;
}

export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ uid: userId }, env.JWT_SECRET, { expiresIn: SESSION_TTL_S });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: SESSION_TTL_S * 1000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { uid: string };
    (req as AuthedRequest).userId = payload.uid;
    next();
  } catch {
    clearSession(res);
    return res.status(401).json({ error: "Session expired" });
  }
}

export const userIdOf = (req: Request) => (req as AuthedRequest).userId;
