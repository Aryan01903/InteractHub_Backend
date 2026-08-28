import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ok } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { assignableRoles, permissionsFor, ROLES } from "../../config/rbac";
import { SOCKET_EVENTS, rooms } from "../../config/events";
import { getRealtime } from "../../realtime";
import * as service from "./org.service";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { preHandler: app.authenticate }, async (request) => {
    const auth = requireAuth(request);
    return ok(await service.listUserOrganizations(auth.userId));
  });

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(2).max(60),
          description: z.string().trim().max(280).optional(),
        }),
      },
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = await service.createOrganization({
        name: request.body.name,
        ownerId: auth.userId,
        ...(request.body.description ? { description: request.body.description } : {}),
      });
      reply.status(201);
      return ok(
        {
          ...(await service.getOrganization(String(org._id))),
          role: "owner" as const,
          permissions: permissionsFor("owner"),
        },
        `${org.name} is ready`,
      );
    },
  );

  app.get("/current", { preHandler: app.withOrg }, async (request) => {
    const org = requireOrg(request);
    return ok({
      ...(await service.getOrganization(org.orgId)),
      role: org.role,
      permissions: permissionsFor(org.role),
      assignableRoles: assignableRoles(org.role),
    });
  });

  app.patch(
    "/current",
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(2).max(60).optional(),
          description: z.string().trim().max(280).optional(),
          accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
          avatarUrl: z.string().url().max(500).optional(),
        }),
      },
      preHandler: app.requirePermission("org:update"),
    },
    async (request) => {
      const org = requireOrg(request);
      const updated = await service.updateOrganization(org.orgId, request.body);
      getRealtime()?.to(rooms.org(org.orgId)).emit(SOCKET_EVENTS.ORG_MEMBER_UPDATED, {
        organization: updated,
      });
      return ok(updated, "Organization updated");
    },
  );

  app.post("/current/activate", { preHandler: app.withOrg }, async (request) => {
    const auth = requireAuth(request);
    const org = requireOrg(request);
    await service.touchActiveOrg(auth.userId, org.orgId);
    return ok({ orgId: org.orgId });
  });

  app.get(
    "/current/members",
    { preHandler: app.requirePermission("member:view") },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      return ok(
        await service.listMembers({
          orgId: org.orgId,
          viewerId: auth.userId,
          viewerRole: org.role,
        }),
      );
    },
  );

  app.post(
    "/current/invites",
    {
      schema: {
        body: z.object({
          email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
          role: z.enum(ROLES).default("member"),
        }),
      },
      preHandler: app.requirePermission("member:invite"),
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const result = await service.inviteMember({
        orgId: org.orgId,
        actorId: auth.userId,
        actorRole: org.role,
        actorName: auth.name,
        email: request.body.email,
        role: request.body.role,
      });
      reply.status(201);
      return ok(
        result,
        result.emailDelivered
          ? `Invitation sent to ${result.email}`
          : `Invitation created, but the email could not be delivered`,
      );
    },
  );

  app.patch(
    "/current/members/:userId/role",
    {
      schema: {
        params: z.object({ userId: objectId }),
        body: z.object({ role: z.enum(ROLES) }),
      },
      preHandler: app.requirePermission("member:role:update"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const member = await service.updateMemberRole({
        orgId: org.orgId,
        actorId: auth.userId,
        actorRole: org.role,
        targetUserId: request.params.userId,
        role: request.body.role,
      });

      const io = getRealtime();
      io?.to(rooms.org(org.orgId)).emit(SOCKET_EVENTS.ORG_MEMBER_UPDATED, { member });
      io?.to(rooms.user(request.params.userId)).emit(SOCKET_EVENTS.ORG_SWITCHED, {
        orgId: org.orgId,
        role: member.role,
      });

      return ok(member, `${member.name} is now a ${member.role}`);
    },
  );

  app.delete(
    "/current/members/:userId",
    {
      schema: { params: z.object({ userId: objectId }) },
      preHandler: app.requirePermission("member:remove"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const result = await service.removeMember({
        orgId: org.orgId,
        actorId: auth.userId,
        actorRole: org.role,
        targetUserId: request.params.userId,
      });

      const io = getRealtime();
      io?.to(rooms.org(org.orgId)).emit(SOCKET_EVENTS.ORG_MEMBER_REMOVED, {
        userId: result.userId,
        orgId: org.orgId,
      });
      io?.to(rooms.user(result.userId)).emit(SOCKET_EVENTS.ORG_MEMBER_REMOVED, {
        userId: result.userId,
        orgId: org.orgId,
        self: true,
      });

      return ok(result, "Member removed");
    },
  );

  app.post(
    "/current/transfer-ownership",
    {
      schema: { body: z.object({ userId: objectId }) },
      preHandler: app.requirePermission("org:transfer"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);
      const result = await service.transferOwnership({
        orgId: org.orgId,
        actorId: auth.userId,
        targetUserId: request.body.userId,
      });
      return ok(result, "Ownership transferred");
    },
  );

  app.post("/current/leave", { preHandler: app.withOrg }, async (request) => {
    const auth = requireAuth(request);
    const org = requireOrg(request);
    const result = await service.removeMember({
      orgId: org.orgId,
      actorId: auth.userId,
      actorRole: org.role,
      targetUserId: auth.userId,
    });
    getRealtime()?.to(rooms.org(org.orgId)).emit(SOCKET_EVENTS.ORG_MEMBER_REMOVED, {
      userId: result.userId,
      orgId: org.orgId,
    });
    return ok(result, "You left the organization");
  });
};

export default orgRoutes;
