import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Types } from "mongoose";
import { Message } from "../../models/message.model";
import { Conversation } from "../../models/conversation.model";
import { Membership } from "../../models/membership.model";
import { Whiteboard } from "../../models/board.model";
import { ok } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { toMessage, toUserSummary, toWhiteboardSummary } from "../../utils/serializers";
import { visibilityFilter } from "../conversation/conversation.service";

const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          q: z.string().trim().min(1).max(120),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        }),
      },
      preHandler: app.withOrg,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const { q, limit } = request.query;

      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const prefix = new RegExp(safe, "i");

      const visible = await Conversation.find(visibilityFilter(org.orgId, auth.userId))
        .select("_id name slug type topic isPrivate participantIds lastMessageAt createdBy createdAt orgId")
        .limit(500);

      const visibleIds = visible.map((conversation) => conversation._id);

      const [messages, members, boards] = await Promise.all([
        Message.find({
          orgId: org.objectId,
          conversationId: { $in: visibleIds },
          deletedAt: { $exists: false },
          $text: { $search: q },
        })
          .populate("sender", "name avatarUrl presenceStatus")
          .sort({ _id: -1 })
          .limit(limit),

        Membership.find({ orgId: org.objectId, status: "active" })
          .populate({
            path: "userId",
            select: "name avatarUrl presenceStatus",
            match: { name: prefix },
          })
          .limit(100),

        Whiteboard.find({ orgId: org.objectId, name: prefix })
          .select("-data")
          .populate("createdBy", "name avatarUrl presenceStatus")
          .sort({ updatedAt: -1 })
          .limit(limit),
      ]);

      const conversations = visible
        .filter((conversation) => {
          const label = conversation.name ?? conversation.slug ?? "";
          return prefix.test(label) || prefix.test(conversation.topic ?? "");
        })
        .slice(0, limit);

      return ok({
        query: q,
        conversations: conversations.map((conversation) => ({
          _id: String(conversation._id),
          name: conversation.name ?? null,
          slug: conversation.slug ?? null,
          type: conversation.type,
          topic: conversation.topic ?? null,
          isPrivate: conversation.isPrivate,
        })),
        messages: messages.map((message) => ({
          ...toMessage(message),
          conversationName:
            visible.find((c) => String(c._id) === String(message.conversationId))?.name ??
            null,
        })),
        people: members
          .filter((membership) => membership.userId)
          .slice(0, limit)
          .map((membership) => ({
            ...toUserSummary(membership.userId),
            role: membership.role,
          })),
        boards: boards.map(toWhiteboardSummary),
      });
    },
  );

  app.get(
    "/members",
    {
      schema: {
        querystring: z.object({
          q: z.string().trim().max(80).default(""),
          limit: z.coerce.number().int().min(1).max(25).default(10),
        }),
      },
      preHandler: app.withOrg,
    },
    async (request) => {
      const org = requireOrg(request);
      const { q, limit } = request.query;

      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const memberships = await Membership.find({
        orgId: org.objectId,
        status: "active",
      })
        .populate({
          path: "userId",
          select: "name avatarUrl presenceStatus",
          ...(safe ? { match: { name: new RegExp(`^${safe}`, "i") } } : {}),
        })
        .limit(200);

      return ok(
        memberships
          .filter((membership) => membership.userId)
          .slice(0, limit)
          .map((membership) => ({
            ...toUserSummary(membership.userId),
            role: membership.role,
          })),
      );
    },
  );
};

export default searchRoutes;

export const asObjectId = (value: string) => new Types.ObjectId(value);
