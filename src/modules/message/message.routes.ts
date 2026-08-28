import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ok, page } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { SOCKET_EVENTS, rooms } from "../../config/events";
import { getRealtime } from "../../realtime";
import { uploadBuffer } from "../../utils/cloudinary";
import { badRequest } from "../../utils/errors";
import * as service from "./message.service";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "application/pdf",
]);

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().max(255),
  type: z.string().max(120),
  size: z.number().int().nonnegative().optional(),
  publicId: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const messageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          conversationId: objectId,
          limit: z.coerce.number().int().min(1).max(100).default(50),
          before: objectId.optional(),
          after: objectId.optional(),
        }),
      },
      preHandler: app.requirePermission("conversation:view"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const result = await service.listMessages({
        orgId: org.orgId,
        userId: auth.userId,
        conversationId: request.query.conversationId,
        limit: request.query.limit,
        ...(request.query.before ? { before: request.query.before } : {}),
        ...(request.query.after ? { after: request.query.after } : {}),
      });

      return ok(page(result.items, result.nextCursor));
    },
  );

  app.get(
    "/context",
    {
      schema: {
        querystring: z.object({
          conversationId: objectId,
          messageId: objectId,
          radius: z.coerce.number().int().min(5).max(50).default(25),
        }),
      },
      preHandler: app.requirePermission("conversation:view"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      return ok(
        await service.getMessageContext({
          orgId: org.orgId,
          userId: auth.userId,
          ...request.query,
        }),
      );
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          conversationId: objectId,
          content: z.string().max(4000).default(""),
          attachments: z.array(attachmentSchema).max(5).default([]),
          replyTo: objectId.optional(),
          mentions: z.array(objectId).max(50).default([]),
        }),
      },
      preHandler: app.requirePermission("message:send"),
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const message = await service.sendMessage({
        orgId: org.orgId,
        userId: auth.userId,
        ...request.body,
      });

      getRealtime()
        ?.to(rooms.conversation(message.conversationId))
        .emit(SOCKET_EVENTS.MESSAGE_NEW, { message });

      reply.status(201);
      return ok(message);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({ content: z.string().min(1).max(4000) }),
      },
      preHandler: app.requirePermission("message:edit:own"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const message = await service.editMessage({
        orgId: org.orgId,
        userId: auth.userId,
        messageId: request.params.id,
        content: request.body.content,
      });

      getRealtime()
        ?.to(rooms.conversation(message.conversationId))
        .emit(SOCKET_EVENTS.MESSAGE_UPDATE, { message });

      return ok(message);
    },
  );

  app.delete(
    "/:id",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("message:delete:own"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const result = await service.deleteMessage({
        orgId: org.orgId,
        userId: auth.userId,
        role: org.role,
        messageId: request.params.id,
      });

      getRealtime()
        ?.to(rooms.conversation(result.conversationId))
        .emit(SOCKET_EVENTS.MESSAGE_DELETE, result);

      return ok(result);
    },
  );

  app.post(
    "/:id/reactions",
    {
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({ emoji: z.string().min(1).max(16) }),
      },
      preHandler: app.requirePermission("message:react"),
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const message = await service.toggleReaction({
        orgId: org.orgId,
        userId: auth.userId,
        messageId: request.params.id,
        emoji: request.body.emoji,
      });

      getRealtime()
        ?.to(rooms.conversation(message.conversationId))
        .emit(SOCKET_EVENTS.MESSAGE_REACTION, {
          messageId: message._id,
          conversationId: message.conversationId,
          reactions: message.reactions,
        });

      return ok(message);
    },
  );

  app.post(
    "/uploads",
    {
      preHandler: app.requirePermission("message:send"),
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request) => {
      const org = requireOrg(request);
      const uploaded = [];

      for await (const part of request.files()) {
        if (!ALLOWED_UPLOAD_TYPES.has(part.mimetype)) {
          throw badRequest(`Unsupported file type: ${part.mimetype}`);
        }

        const buffer = await part.toBuffer();
        uploaded.push(
          await uploadBuffer({
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
            orgId: org.orgId,
          }),
        );
      }

      if (uploaded.length === 0) throw badRequest("No files were provided");

      return ok({ attachments: uploaded });
    },
  );
};

export default messageRoutes;
