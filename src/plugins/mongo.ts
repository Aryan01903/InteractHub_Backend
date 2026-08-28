import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import mongoose from "mongoose";
import { env, isProduction } from "../config/env";

async function mongoPlugin(app: FastifyInstance) {
  mongoose.set("strictQuery", true);


  mongoose.connection.on("disconnected", () => {
    app.log.warn("mongodb disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    app.log.info("mongodb reconnected");
  });

  await mongoose.connect(env.DB_URL, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 2,
  });

  app.log.info("mongodb connected");

  if (!isProduction) {
    await Promise.all(
      mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()),
    );
    app.log.info("mongodb indexes synced");
  }

  app.addHook("onClose", async () => {
    await mongoose.connection.close();
  });
}

export default fp(mongoPlugin, { name: "mongo" });
