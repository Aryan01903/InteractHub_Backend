import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { Types } from "mongoose";
import { env } from "../config/env";
import { can, type Permission, type Role } from "../config/rbac";
import { Membership } from "../models/membership.model";
import { forbidden, unauthorized } from "../utils/errors";

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
}

export interface OrgContext {
  orgId: string;
  objectId: Types.ObjectId;
  role: Role;
  membershipId: string;
}

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  activeOrgId?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    withOrg: preHandlerHookHandler;
    requirePermission: (permission: Permission) => preHandlerHookHandler;
    signSession: (claims: SessionClaims) => string;
  }

  interface FastifyRequest {
    auth?: AuthContext;
    org?: OrgContext;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionClaims;
    user: SessionClaims;
  }
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export function requireOrg(request: FastifyRequest): OrgContext {
  if (!request.org) throw forbidden("No organization context for this request");
  return request.org;
}

async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: env.SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
    messages: {
      badRequestErrorMessage: "Malformed Authorization header",
      noAuthorizationInHeaderMessage: "Authentication required",
      authorizationTokenExpiredMessage: "Session expired. Please sign in again.",
      authorizationTokenInvalid: () => "Invalid session token",
    },
  });

  app.decorate("signSession", (claims: SessionClaims) => app.jwt.sign(claims));

  async function resolveAuth(request: FastifyRequest): Promise<AuthContext> {
    if (request.auth) return request.auth;

    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized("Session expired or invalid. Please sign in again.");
    }

    const claims = request.user;
    if (!claims?.sub || !Types.ObjectId.isValid(claims.sub)) {
      throw unauthorized("Invalid session token");
    }

    request.auth = {
      userId: claims.sub,
      email: claims.email,
      name: claims.name,
    };
    return request.auth;
  }

  async function resolveOrg(request: FastifyRequest): Promise<OrgContext> {
    if (request.org) return request.org;
    const auth = await resolveAuth(request);

    const headerOrg = request.headers["x-org-id"];
    const requested =
      (Array.isArray(headerOrg) ? headerOrg[0] : headerOrg) ??
      request.user?.activeOrgId;

    if (!requested) {
      throw forbidden("Select an organization to continue");
    }
    if (!Types.ObjectId.isValid(requested)) {
      throw forbidden("Invalid organization");
    }

    const membership = await Membership.findOne({
      userId: new Types.ObjectId(auth.userId),
      orgId: new Types.ObjectId(requested),
      status: "active",
    })
      .select("_id orgId role")
      .lean();

    if (!membership) {
      throw forbidden("You do not have access to this organization");
    }

    request.org = {
      orgId: String(membership.orgId),
      objectId: membership.orgId as Types.ObjectId,
      role: membership.role,
      membershipId: String(membership._id),
    };
    return request.org;
  }

  const authenticate: preHandlerHookHandler = async (request) => {
    await resolveAuth(request);
  };

  const withOrg: preHandlerHookHandler = async (request) => {
    await resolveOrg(request);
  };

  app.decorate("authenticate", authenticate);
  app.decorate("withOrg", withOrg);

  app.decorate("requirePermission", (permission: Permission) => {
    const handler: preHandlerHookHandler = async (request) => {
      const org = await resolveOrg(request);

      if (!can(org.role, permission)) {
        throw forbidden(`Your role (${org.role}) cannot perform this action`);
      }
    };
    return handler;
  });
}

export default fp(authPlugin, { name: "auth" });
