import { buildApp } from "./app";
import { createRealtime } from "./realtime";
import { env } from "./config/env";
import { logger } from "./utils/logger";

async function main() {
  const app = await buildApp();

  await app.ready();
  const io = createRealtime(app.server, app);

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`InteractHub API listening on ${env.HOST}:${env.PORT}`);

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "shutting down");

    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();

    process.exit(0);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaught exception");
    process.exit(1);
  });
}

void main().catch((error) => {
  logger.fatal({ err: error }, "failed to start server");
  process.exit(1);
});
