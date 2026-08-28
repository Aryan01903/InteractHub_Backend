import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Contact } from "../../models/contact.model";
import { ok, page } from "../../utils/response";
import { forbidden, notFound, unauthorized } from "../../utils/errors";
import { env, adminConsoleEnabled } from "../../config/env";
import { encodeCursor, decodeCursor, slicePage } from "../../utils/cursor";

const submissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  topic: z.enum(["sales", "support", "partnership", "other"]).default("other"),
  message: z.string().trim().min(10).max(4000),
  source: z.string().trim().max(200).optional(),
});

function matches(candidate: string, expected: string) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function requireAdminToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Admin sign-in required");

  try {
    const claims = request.server.jwt.verify<{ scope?: string }>(header.slice(7));
    if (claims.scope !== "admin") throw forbidden("Not an admin session");
  } catch (error) {
    if (error instanceof Error && error.name === "AppError") throw error;
    throw unauthorized("Admin session expired");
  }
}

const contactRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/",
    {
      schema: { body: submissionSchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const submission = await Contact.create({ ...request.body, ip: request.ip });
      reply.code(201);
      return ok(
        { _id: String(submission._id), receivedAt: submission.createdAt },
        "Thanks — we'll be in touch shortly.",
      );
    },
  );

  app.post(
    "/admin/session",
    {
      schema: { body: z.object({ password: z.string().min(1).max(200) }) },
      config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
    },
    async (request) => {
      if (!adminConsoleEnabled || !env.ADMIN_PASSWORD) {
        throw forbidden("The admin console is not configured on this server");
      }
      if (!matches(request.body.password, env.ADMIN_PASSWORD)) {
        throw unauthorized("Incorrect password");
      }

      const token = app.jwt.sign(
        { scope: "admin" } as unknown as Parameters<typeof app.jwt.sign>[0],
        { expiresIn: "2h" },
      );
      return ok({ token, expiresIn: 7200 });
    },
  );

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          status: z.enum(["new", "read", "archived", "all"]).default("all"),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          before: z.string().optional(),
        }),
      },
      preHandler: requireAdminToken,
    },
    async (request) => {
      const { status, limit, before } = request.query;
      const cursor = before ? decodeCursor(before) : null;

      const rows = await Contact.find({
        ...(status === "all" ? {} : { status }),
        ...(cursor ? { _id: { $lt: cursor } } : {}),
      })
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();

      const { items, nextCursor } = slicePage(rows, limit, (row) => encodeCursor(row._id));

      return ok(
        page(
          items.map((row) => ({
            _id: String(row._id),
            name: row.name,
            email: row.email,
            company: row.company ?? null,
            topic: row.topic,
            message: row.message,
            status: row.status,
            createdAt: row.createdAt,
          })),
          nextCursor,
        ),
      );
    },
  );

  app.get("/stats", { preHandler: requireAdminToken }, async () => {
    const [total, unread, archived] = await Promise.all([
      Contact.countDocuments({}),
      Contact.countDocuments({ status: "new" }),
      Contact.countDocuments({ status: "archived" }),
    ]);
    return ok({ total, unread, archived });
  });

  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().length(24) }),
        body: z.object({ status: z.enum(["new", "read", "archived"]) }),
      },
      preHandler: requireAdminToken,
    },
    async (request) => {
      const updated = await Contact.findByIdAndUpdate(
        request.params.id,
        { $set: { status: request.body.status } },
        { new: true },
      ).lean();

      if (!updated) throw notFound("Submission not found");
      return ok({ _id: String(updated._id), status: updated.status });
    },
  );
};

export default contactRoutes;
