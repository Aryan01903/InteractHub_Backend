import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { allowedOrigins, env, isProduction } from "./config/env";
import { logger } from "./utils/logger";
import authPlugin from "./plugins/auth";
import mongoPlugin from "./plugins/mongo";
import errorHandlerPlugin from "./plugins/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import orgRoutes from "./modules/org/org.routes";
import conversationRoutes from "./modules/conversation/conversation.routes";
import messageRoutes from "./modules/message/message.routes";
import boardRoutes from "./modules/board/board.routes";
import callRoutes from "./modules/call/call.routes";
import searchRoutes from "./modules/search/search.routes";
import contactRoutes from "./modules/contact/contact.routes";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 1_048_576 * 2,
    genReqId: () => crypto.randomUUID(),
    pluginTimeout: 60_000,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandlerPlugin);
  await app.register(sensible);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Org-Id"],
    exposedHeaders: ["X-Org-Id"],
    credentials: true,
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
    addHeadersOnExceeding: { "x-ratelimit-remaining": true },
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  });

  await app.register(mongoPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => ({
    success: true,
    data: { ok: true, uptime: process.uptime(), env: env.NODE_ENV },
  }));

  const api = app.withTypeProvider<ZodTypeProvider>();

  await api.register(authRoutes, { prefix: "/api/auth" });
  await api.register(orgRoutes, { prefix: "/api/orgs" });
  await api.register(conversationRoutes, { prefix: "/api/conversations" });
  await api.register(messageRoutes, { prefix: "/api/messages" });
  await api.register(boardRoutes, { prefix: "/api/boards" });
  await api.register(callRoutes, { prefix: "/api/calls" });
  await api.register(searchRoutes, { prefix: "/api/search" });
  await api.register(contactRoutes, { prefix: "/api/contact" });

  if (!isProduction) {
    app.ready(() => {
      app.log.debug(`\n${app.printRoutes({ commonPrefix: false })}`);
    });
  }

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
