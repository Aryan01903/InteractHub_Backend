export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose = true;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have permission to do that") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (resource = "Resource") =>
  new AppError(404, "NOT_FOUND", `${resource} not found`);

export const conflict = (message: string) =>
  new AppError(409, "CONFLICT", message);

export const tooManyRequests = (message = "Too many requests") =>
  new AppError(429, "RATE_LIMITED", message);

export const internal = (message = "Internal server error") =>
  new AppError(500, "INTERNAL", message);

export const serviceUnavailable = (message: string) =>
  new AppError(503, "SERVICE_UNAVAILABLE", message);

export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError;
