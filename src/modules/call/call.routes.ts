import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { CallRoom } from "../../models/callRoom.model";
import { Organization } from "../../models/organization.model";
import { Membership } from "../../models/membership.model";
import { ok } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { forbidden, notFound } from "../../utils/errors";
import { can } from "../../config/rbac";
import { env } from "../../config/env";
import { toCallRoom } from "../../utils/serializers";
import { sendCallInviteEmail } from "../../utils/mailer";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

function iceServers() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  if (env.TURN_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({
      urls: env.TURN_URL,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }

  return servers;
}

const callRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { preHandler: app.requirePermission("call:view") }, async (request) => {
    const org = requireOrg(request);

    const rooms = await CallRoom.find({
      orgId: org.objectId,
      expiresAt: { $gt: new Date() },
      endedAt: { $exists: false },
    })
      .populate("createdBy", "name avatarUrl presenceStatus")
      .sort({ scheduledAt: 1, createdAt: -1 })
      .limit(100);

    return ok(rooms.map(toCallRoom));
  });

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          title: z.string().trim().min(1).max(80).default("Team Meeting"),
          scheduledAt: z.coerce.date().optional(),
          conversationId: objectId.optional(),
          inviteUserIds: z.array(objectId).max(100).default([]),
        }),
      },
      preHandler: app.requirePermission("call:create"),
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const scheduled =
        request.body.scheduledAt && request.body.scheduledAt.getTime() > Date.now()
          ? request.body.scheduledAt
          : null;
      const startsAt = scheduled ?? new Date();

      const room = await CallRoom.create({
        roomId: randomUUID(),
        title: request.body.title,
        orgId: org.objectId,
        createdBy: new Types.ObjectId(auth.userId),
        ...(request.body.conversationId
          ? { conversationId: new Types.ObjectId(request.body.conversationId) }
          : {}),
        scheduledAt: scheduled,
        expiresAt: new Date(startsAt.getTime() + ROOM_TTL_MS),
      });

      if (request.body.inviteUserIds.length > 0) {
        const invitees = await Membership.find({
          orgId: org.objectId,
          userId: { $in: request.body.inviteUserIds.map((id) => new Types.ObjectId(id)) },
          status: "active",
        })
          .populate<{ userId: { email: string } }>("userId", "email")
          .lean();

        const emails = invitees
          .map((membership) => membership.userId?.email)
          .filter((email): email is string => Boolean(email));

        if (emails.length > 0) {
          const organization = await Organization.findById(org.objectId).select("name").lean();
          void sendCallInviteEmail({
            to: emails,
            roomId: room.roomId,
            title: room.title,
            hostName: auth.name,
            orgName: organization?.name ?? "your organization",
            startsAt,
          });
        }
      }

      await room.populate("createdBy", "name avatarUrl presenceStatus");
      reply.status(201);
      return ok(
        {
          ...toCallRoom(room),
          iceServers: iceServers(),
          joinUrl: `${env.FRONTEND_URL}/call/${room.roomId}`,
        },
        scheduled ? "Meeting scheduled" : "Meeting ready",
      );
    },
  );

  app.get(
    "/:roomId",
    {
      schema: { params: z.object({ roomId: z.string().min(8).max(64) }) },
      preHandler: app.requirePermission("call:join"),
    },
    async (request) => {
      const org = requireOrg(request);

      const room = await CallRoom.findOne({
        roomId: request.params.roomId,
        orgId: org.objectId,
      }).populate("createdBy", "name avatarUrl presenceStatus");

      if (!room) throw notFound("Meeting");
      if (room.endedAt || room.expiresAt.getTime() < Date.now()) {
        throw notFound("Meeting");
      }

      return ok({ ...toCallRoom(room), iceServers: iceServers() });
    },
  );

  app.post(
    "/:roomId/end",
    {
      schema: { params: z.object({ roomId: z.string().min(8).max(64) }) },
      preHandler: app.requirePermission("call:join"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const room = await CallRoom.findOne({
        roomId: request.params.roomId,
        orgId: org.objectId,
      });
      if (!room) throw notFound("Meeting");

      const isHost = String(room.createdBy) === auth.userId;
      if (!isHost && !can(org.role, "call:end:any")) {
        throw forbidden("Only the host can end this meeting");
      }

      room.endedAt = new Date();
      await room.save();

      return ok({ roomId: room.roomId, endedAt: room.endedAt.toISOString() }, "Meeting ended");
    },
  );
};

export default callRoutes;
