import pino from "pino";
import { env, isProduction } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "otp",
      "*.otp",
      "token",
      "*.token",
    ],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
