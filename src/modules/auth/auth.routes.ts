import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ok } from "../../utils/response";
import { requireAuth } from "../../plugins/auth";
import * as service from "./auth.service";
import type { SessionPayload } from "./auth.service";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  inviteLookupSchema,
  loginSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from "./auth.schemas";

const strictLimit = {
  rateLimit: { max: 10, timeWindow: "5 minutes" },
} as const;

const veryStrictLimit = {
  rateLimit: { max: 5, timeWindow: "15 minutes" },
} as const;

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const withToken = (session: SessionPayload) => ({
    ...session,
    token: app.signSession({
      sub: session.user._id,
      email: session.user.email,
      name: session.user.name,
      ...(session.activeOrgId ? { activeOrgId: session.activeOrgId } : {}),
    }),
  });

  app.post(
    "/register",
    { schema: { body: registerSchema }, config: strictLimit },
    async (request) => {
      const result = await service.register(request.body);
      return ok(result, "We sent a 6-digit code to your email");
    },
  );

  app.post(
    "/verify-otp",
    { schema: { body: verifyOtpSchema }, config: strictLimit },
    async (request) => {
      const result = await service.verifyOtpAndSignIn(request.body);

      if (result.kind === "reset") {
        return ok(
          { resetToken: result.resetToken },
          "Code confirmed. Choose a new password.",
        );
      }
      return ok(withToken(result.session), "Signed in");
    },
  );

  app.post(
    "/login",
    { schema: { body: loginSchema }, config: strictLimit },
    async (request) => {
      const session = await service.login(request.body);
      return ok(withToken(session), "Signed in");
    },
  );

  app.post(
    "/request-otp",
    { schema: { body: requestOtpSchema }, config: veryStrictLimit },
    async (request) => {
      await service.requestOtp(request.body);
      return ok({ sent: true }, "If that email has an account, a code is on its way");
    },
  );

  app.post(
    "/forgot-password",
    { schema: { body: forgotPasswordSchema }, config: veryStrictLimit },
    async (request) => {
      await service.forgotPassword(request.body);
      return ok({ sent: true }, "If that email has an account, a reset link is on its way");
    },
  );

  app.post(
    "/reset-password",
    { schema: { body: resetPasswordSchema }, config: veryStrictLimit },
    async (request) => {
      await service.resetPassword(request.body);
      return ok({ reset: true }, "Password updated. You can sign in now.");
    },
  );

  app.get(
    "/invite",
    { schema: { querystring: inviteLookupSchema }, config: strictLimit },
    async (request) => ok(await service.peekInvite(request.query.token)),
  );

  app.post(
    "/accept-invite",
    { schema: { body: acceptInviteSchema }, config: strictLimit },
    async (request) => {
      let authenticatedUserId: string | undefined;
      try {
        await request.jwtVerify();
        authenticatedUserId = request.user?.sub;
      } catch {
        authenticatedUserId = undefined;
      }

      const result = await service.acceptInvite({
        ...request.body,
        ...(authenticatedUserId ? { authenticatedUserId } : {}),
      });

      return ok(
        { ...withToken(result.session), orgId: result.orgId },
        "Welcome to the team",
      );
    },
  );

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    const auth = requireAuth(request);
    const session = await service.getSession(auth.userId);
    return ok(session);
  });

  app.patch(
    "/me",
    { schema: { body: updateProfileSchema }, preHandler: app.authenticate },
    async (request) => {
      const auth = requireAuth(request);
      const user = await service.updateProfile(auth.userId, request.body);
      return ok(user, "Profile updated");
    },
  );

  app.post(
    "/switch-org",
    {
      schema: { body: z.object({ orgId: z.string().length(24) }) },
      preHandler: app.withOrg,
    },
    async (request) => {
      const auth = requireAuth(request);
      const session = await service.getSession(auth.userId);
      const target = session.organizations.find(
        (org) => org._id === request.body.orgId,
      );
      if (!target) {
        return ok(withToken(session));
      }
      return ok(withToken({ ...session, activeOrgId: target._id }));
    },
  );
};

export default authRoutes;
