import { Types } from "mongoose";
import { User, type UserDocument } from "../../models/user.model";
import { Membership } from "../../models/membership.model";
import { Organization } from "../../models/organization.model";
import { Invite } from "../../models/invite.model";
import { PasswordReset } from "../../models/passwordReset.model";
import {
  generateOtp,
  generateToken,
  hashOtp,
  hashPassword,
  hashToken,
  verifyOtp as compareOtp,
  verifyPassword,
} from "../../utils/crypto";
import {
  sendOtpEmail,
  sendPasswordResetEmail,
} from "../../utils/mailer";
import { badRequest, conflict, notFound, tooManyRequests, unauthorized } from "../../utils/errors";
import { toViewer, type ViewerDTO } from "../../utils/serializers";
import { createOrganization, listUserOrganizations } from "../org/org.service";
import type { OrganizationMembershipDTO } from "../../utils/serializers";
import { logger } from "../../utils/logger";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export interface SessionPayload {
  user: ViewerDTO;
  organizations: OrganizationMembershipDTO[];
  activeOrgId: string | null;
}

async function issueOtp(
  user: UserDocument,
  purpose: "register" | "login" | "forgotpassword",
) {
  const otp = generateOtp();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otpHash: await hashOtp(otp),
        otpExpires: new Date(Date.now() + OTP_TTL_MS),
        otpPurpose: purpose,
        otpAttempts: 0,
      },
    },
  );
  await sendOtpEmail(user.email, otp, purpose);
}

async function buildSession(user: UserDocument): Promise<SessionPayload> {
  const organizations = await listUserOrganizations(String(user._id));
  const preferred = user.defaultOrgId ? String(user.defaultOrgId) : null;

  const activeOrgId =
    (preferred && organizations.some((org) => org._id === preferred)
      ? preferred
      : organizations[0]?._id) ?? null;

  return { user: toViewer(user), organizations, activeOrgId };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  organizationName?: string;
}) {
  const existing = await User.findOne({ email: input.email }).select("+otpExpires isVerified");

  if (existing) {
    if (existing.isVerified) {
      throw conflict("An account with that email already exists");
    }
    await User.deleteOne({ _id: existing._id });
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    password: await hashPassword(input.password),
    isVerified: false,
  });

  await issueOtp(user, "register");

  if (input.organizationName) {
    pendingOrgNames.set(input.email, input.organizationName);
  }

  return { email: user.email, otpSent: true };
}

const pendingOrgNames = new Map<string, string>();

export async function verifyOtpAndSignIn(input: {
  email: string;
  otp: string;
  purpose: "register" | "login" | "forgotpassword";
}) {
  const user = await User.findOne({ email: input.email }).select(
    "+otpHash +otpExpires +otpPurpose +otpAttempts",
  );
  if (!user) throw notFound("Account");

  if (!user.otpHash || !user.otpExpires) {
    throw badRequest("No verification code is pending. Request a new one.");
  }
  if (user.otpExpires.getTime() < Date.now()) {
    throw badRequest("That code has expired. Request a new one.");
  }
  if (user.otpPurpose !== input.purpose) {
    throw badRequest("That code was issued for a different action");
  }
  if ((user.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
    throw tooManyRequests("Too many incorrect codes. Request a new one.");
  }

  const matches = await compareOtp(input.otp, user.otpHash);
  if (!matches) {
    await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } });
    throw badRequest("That code is not correct");
  }

  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;

  if (input.purpose === "register") {
    user.isVerified = true;
  }
  if (!user.isVerified) {
    throw unauthorized("Confirm your email address before signing in");
  }

  await user.save();

  if (input.purpose === "register") {
    const orgName = pendingOrgNames.get(input.email);
    if (orgName) {
      pendingOrgNames.delete(input.email);
      const org = await createOrganization({ name: orgName, ownerId: String(user._id) });
      user.defaultOrgId = org._id;
    }
  }

  if (input.purpose === "forgotpassword") {
    const token = generateToken();
    await PasswordReset.create({
      userId: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    return { kind: "reset" as const, resetToken: token };
  }

  return { kind: "session" as const, session: await buildSession(user) };
}

export async function login(input: { email: string; password: string }) {
  const user = await User.findOne({ email: input.email }).select("+password");

  const DUMMY = "$2a$12$........................................................";
  const valid = user?.password
    ? await verifyPassword(input.password, user.password)
    : await verifyPassword(input.password, DUMMY).catch(() => false);

  if (!user || !valid) {
    throw unauthorized("Incorrect email or password");
  }
  if (!user.isVerified) {
    await issueOtp(user, "register");
    throw unauthorized("Confirm your email address. We sent you a new code.");
  }

  return buildSession(user);
}

export async function requestOtp(input: {
  email: string;
  purpose: "register" | "login" | "forgotpassword";
}) {
  const user = await User.findOne({ email: input.email });

  if (user) {
    await issueOtp(user, input.purpose);
  } else {
    logger.debug({ email: input.email }, "otp requested for unknown account");
  }

  return { sent: true };
}

export async function forgotPassword(input: { email: string }) {
  const user = await User.findOne({ email: input.email });

  if (user) {
    const token = generateToken();
    await PasswordReset.create({
      userId: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await sendPasswordResetEmail(user.email, token);
  }

  return { sent: true };
}

export async function resetPassword(input: { token: string; password: string }) {
  const record = await PasswordReset.findOne({
    tokenHash: hashToken(input.token),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw badRequest("That reset link is invalid or has expired");
  }

  const user = await User.findById(record.userId);
  if (!user) throw notFound("Account");

  user.password = await hashPassword(input.password);
  user.isVerified = true;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  await PasswordReset.deleteMany({
    userId: user._id,
    _id: { $ne: record._id },
    usedAt: { $exists: false },
  });

  return { reset: true };
}

export async function peekInvite(token: string) {
  const invite = await Invite.findOne({
    tokenHash: hashToken(token),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).populate("orgId", "name slug avatarUrl accent");

  if (!invite) throw badRequest("That invitation is invalid or has expired");

  const org = invite.orgId as unknown as { name: string; avatarUrl?: string; accent?: string };
  const hasAccount = await User.exists({ email: invite.email });

  return {
    email: invite.email,
    role: invite.role,
    organizationName: org?.name ?? "an organization",
    organizationAvatar: org?.avatarUrl ?? null,
    accent: org?.accent ?? null,
    requiresSignup: !hasAccount,
  };
}

export async function acceptInvite(input: {
  token: string;
  name?: string;
  password?: string;
  authenticatedUserId?: string;
}) {
  const invite = await Invite.findOne({
    tokenHash: hashToken(input.token),
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!invite) throw badRequest("That invitation is invalid or has expired");

  let user = await User.findOne({ email: invite.email });

  if (input.authenticatedUserId) {
    if (!user || String(user._id) !== input.authenticatedUserId) {
      throw badRequest("This invitation was sent to a different email address");
    }
  } else if (!user) {
    if (!input.name || !input.password) {
      throw badRequest("A name and password are required to create your account");
    }
    user = await User.create({
      name: input.name,
      email: invite.email,
      password: await hashPassword(input.password),
      isVerified: true,
    });
  } else if (input.password) {
    const withHash = await User.findById(user._id).select("+password");
    const valid =
      withHash?.password && (await verifyPassword(input.password, withHash.password));
    if (!valid) throw unauthorized("Incorrect password for that account");
  } else {
    throw badRequest("Sign in to accept this invitation");
  }

  const already = await Membership.exists({ userId: user._id, orgId: invite.orgId });
  if (!already) {
    await Membership.create({
      userId: user._id,
      orgId: invite.orgId,
      role: invite.role,
      joinedAt: new Date(),
    });
    await Organization.updateOne({ _id: invite.orgId }, { $inc: { memberCount: 1 } });
  }

  invite.usedAt = new Date();
  await invite.save();

  user.defaultOrgId = invite.orgId;
  await user.save();

  return {
    session: await buildSession(user),
    orgId: String(invite.orgId),
  };
}

export async function getSession(userId: string): Promise<SessionPayload> {
  const user = await User.findById(userId);
  if (!user) throw notFound("Account");
  return buildSession(user);
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; avatarUrl?: string | null },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.avatarUrl !== undefined) {
    update.avatarUrl = patch.avatarUrl ?? undefined;
  }

  const user = await User.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!user) throw notFound("Account");
  return toViewer(user);
}

export { buildSession };
