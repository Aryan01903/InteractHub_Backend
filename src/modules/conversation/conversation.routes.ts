import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ok } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { SOCKET_EVENTS, rooms } from "../../config/events";
import { getRealtime } from "../../realtime";
import { toConversation } from "../../utils/serializers";
import * as service from "./conversation.service";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const conversationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { preHandler: app.requirePermission("conversation:view") },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      return ok(
        await service.listConversations({ orgId: org.orgId, userId: auth.userId }),
      );
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          type: z.enum(["channel", "group"]).default("channel"),
          name: z.string().trim().min(1).max(80),
          topic: z.string().trim().max(280).optional(),
          isPrivate: z.boolean().default(false),
          participantIds: z.array(objectId).max(200).default([]),
        }),
      },
      preHandler: app.requirePermission("conversation:create"),
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const conversation = await service.createConversation({
        orgId: org.orgId,
        userId: auth.userId,
        ...request.body,
      });

      const io = getRealtime();
      if (conversation.isPrivate || conversation.type !== "channel") {
        for (const participant of conversation.participants) {
          io?.to(rooms.user(participant._id)).emit(
            SOCKET_EVENTS.CONVERSATION_CREATED,
            { conversation },
          );
        }
      } else {
        io?.to(rooms.org(org.orgId)).emit(SOCKET_EVENTS.CONVERSATION_CREATED, {
          conversation,
        });
      }

      reply.status(201);
      return ok(conversation, `${conversation.name ?? "Conversation"} created`);
    },
  );

  app.post(
    "/direct",
    {
      schema: { body: z.object({ userId: objectId }) },
      preHandler: app.requirePermission("conversation:view"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const conversation = await service.ensureDirectMessage({
        orgId: org.orgId,
        userId: auth.userId,
        targetUserId: request.body.userId,
      });

      const io = getRealtime();
      for (const participant of conversation.participants) {
        io?.to(rooms.user(participant._id)).emit(SOCKET_EVENTS.CONVERSATION_CREATED, {
          conversation,
        });
      }

      return ok(conversation);
    },
  );

  app.get(
    "/:id",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("conversation:view"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const conversation = await service.getConversation({
        orgId: org.orgId,
        userId: auth.userId,
        conversationId: request.params.id,
      });
      return ok(toConversation(conversation));
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({
          name: z.string().trim().min(1).max(80).optional(),
          topic: z.string().trim().max(280).optional(),
          participantIds: z.array(objectId).max(200).optional(),
        }),
      },
      preHandler: app.requirePermission("conversation:update"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const conversation = await service.updateConversation({
        orgId: org.orgId,
        userId: auth.userId,
        role: org.role,
        conversationId: request.params.id,
        patch: request.body,
      });

      getRealtime()
        ?.to(rooms.conversation(request.params.id))
        .emit(SOCKET_EVENTS.CONVERSATION_UPDATED, { conversation });

      return ok(conversation, "Conversation updated");
    },
  );

  app.delete(
    "/:id",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("conversation:delete"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const result = await service.deleteConversation({
        orgId: org.orgId,
        userId: auth.userId,
        role: org.role,
        conversationId: request.params.id,
      });

      getRealtime()
        ?.to(rooms.org(org.orgId))
        .emit(SOCKET_EVENTS.CONVERSATION_DELETED, result);

      return ok(result, "Conversation deleted");
    },
  );

  app.post(
    "/:id/read",
    {
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({ messageId: objectId.optional() }).default({}),
      },
      preHandler: app.requirePermission("conversation:view"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      await service.getConversation({
        orgId: org.orgId,
        userId: auth.userId,
        conversationId: request.params.id,
      });

      const result = await service.markRead({
        orgId: org.orgId,
        userId: auth.userId,
        conversationId: request.params.id,
        ...(request.body.messageId ? { messageId: request.body.messageId } : {}),
      });

      getRealtime()
        ?.to(rooms.user(auth.userId))
        .emit(SOCKET_EVENTS.CONVERSATION_READ, result);

      return ok(result);
    },
  );
};

export default conversationRoutes;
