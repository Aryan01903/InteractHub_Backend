import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { isProduction } from "../config/env";
import { AppError } from "../utils/errors";
import type { ApiFailure } from "../utils/response";

function describe(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "The request could not be validated",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "The request could not be validated",
      details: Object.entries(error.errors).map(([path, issue]) => ({
        path,
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return { statusCode: 400, code: "BAD_REQUEST", message: "Malformed identifier" };
  }

  const candidate = error as unknown as Omit<FastifyError, "code"> & {
    code?: string | number;
  };

  if (candidate?.code === 11000) {
    return {
      statusCode: 409,
      code: "CONFLICT",
      message: "That already exists",
    };
  }

  if (candidate?.code === "FST_ERR_VALIDATION") {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: candidate.message ?? "The request could not be validated",
    };
  }

  if (candidate?.code === "FST_REQ_FILE_TOO_LARGE") {
    return {
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "File exceeds the 10MB limit",
    };
  }

  if (candidate?.statusCode && candidate.statusCode < 500) {
    return {
      statusCode: candidate.statusCode,
      code: String(candidate.code ?? "BAD_REQUEST"),
      message: candidate.message,
    };
  }

  return { statusCode: 500, code: "INTERNAL", message: "Internal server error" };
}

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const described = describe(error);

      if (described.statusCode >= 500) {
        request.log.error({ err: error }, "unhandled request error");
      } else {
        request.log.debug(
          { err: error.message, code: described.code },
          "request rejected",
        );
      }

      const body: ApiFailure = {
        success: false,
        error: {
          code: described.code,
          message:
            described.statusCode >= 500 && isProduction
              ? "Internal server error"
              : described.message,
          ...(described.details !== undefined
            ? { details: described.details }
            : {}),
        },
      };

      return reply.status(described.statusCode).send(body);
    },
  );

  app.setNotFoundHandler((request, reply) => {
    const body: ApiFailure = {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${request.method} ${request.url}`,
      },
    };
    return reply.status(404).send(body);
  });
}

export default fp(errorHandlerPlugin, { name: "error-handler" });
