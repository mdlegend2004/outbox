import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { logger, errMessage } from "../lib/logger";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Forward async errors to the error handler (Express 4 doesn't do it itself). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  logger.error("Unhandled API error", { error: errMessage(err) });
  res.status(500).json({ error: "Internal server error" });
}
