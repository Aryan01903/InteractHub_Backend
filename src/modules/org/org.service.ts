import mongoose, { Types } from "mongoose";
import { Organization, type OrganizationDocument } from "../../models/organization.model";
import { Membership } from "../../models/membership.model";
import { Conversation } from "../../models/conversation.model";
import { User } from "../../models/user.model";
import { Invite } from "../../models/invite.model";
import { assignableRoles, outranks, type Role } from "../../config/rbac";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors";
import { generateToken, hashToken, slugify } from "../../utils/crypto";
import { sendInviteEmail, sendOrgCreatedEmail } from "../../utils/mailer";
import {
  toMember,
  toOrganization,
  toOrganizationMembership,
  type MemberDTO,
  type OrganizationMembershipDTO,
} from "../../utils/serializers";
import { logger } from "../../utils/logger";

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "workspace";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await Organization.exists({ slug: candidate });
    if (!taken) return candidate;
  }
  return `${base}-${generateToken(4).toLowerCase()}`;
}

export async function createOrganization(params: {
  name: string;
  ownerId: string;
  description?: string;
}): Promise<OrganizationDocument> {
  const slug = await uniqueSlug(params.name);
  const ownerId = new Types.ObjectId(params.ownerId);

  const write = async (session?: mongoose.ClientSession) => {
    const options = session ? { session } : {};

    const [org] = await Organization.create(
      [
        {
          name: params.name.trim(),
          slug,
          description: params.description?.trim(),
          ownerId,
          memberCount: 1,
        },
      ],
      options,
    );
    if (!org) throw new Error("Organization insert returned nothing");

    await Membership.create(
      [{ userId: ownerId, orgId: org._id, role: "owner" as Role, joinedAt: new Date() }],
      options,
    );

    await Conversation.create(
      [
        {
          orgId: org._id,
          type: "channel",
          name: "general",
          slug: "general",
          topic: "Everything that matters, in one place.",
          isPrivate: false,
          createdBy: ownerId,
          participantIds: [],
        },
      ],
      options,
    );

    return org;
  };

  let org: OrganizationDocument;
  const session = await mongoose.startSession().catch(() => null);

  if (session) {
    try {
      session.startTransaction();
      org = await write(session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      const unsupported =
        error instanceof Error &&
        /Transaction numbers|replica set|not supported/i.test(error.message);
      if (!unsupported) throw error;
      org = await write();
    } finally {
      await session.endSession();
    }
  } else {
    org = await write();
  }

  await User.updateOne({ _id: ownerId }, { $set: { defaultOrgId: org._id } });

  const owner = await User.findById(ownerId).select("email").lean();
  if (owner?.email) {
    void sendOrgCreatedEmail({
      to: owner.email,
      orgName: org.name,
      orgId: String(org._id),
    });
  }

  return org;
}

export async function listUserOrganizations(
  userId: string,
): Promise<OrganizationMembershipDTO[]> {
  const memberships = await Membership.find({
    userId: new Types.ObjectId(userId),
    status: "active",
  })
    .populate<{ orgId: OrganizationDocument }>("orgId")
    .sort({ lastActiveAt: -1, joinedAt: -1 })
    .lean({ virtuals: false });

  return memberships
    .filter((membership) => membership.orgId)
    .map((membership) =>
      toOrganizationMembership(
        membership.orgId as unknown as OrganizationDocument,
        { role: membership.role, joinedAt: membership.joinedAt },
      ),
    );
}

export async function getOrganization(orgId: string) {
  const org = await Organization.findById(orgId);
  if (!org) throw notFound("Organization");
  return toOrganization(org);
}

export async function updateOrganization(
  orgId: string,
  patch: { name?: string; description?: string; accent?: string; avatarUrl?: string },
) {
  const org = await Organization.findByIdAndUpdate(
    orgId,
    { $set: patch },
    { new: true, runValidators: true },
  );
  if (!org) throw notFound("Organization");
  return toOrganization(org);
}

export async function listMembers(params: {
  orgId: string;
  viewerId: string;
  viewerRole: Role;
}): Promise<MemberDTO[]> {
  const memberships = await Membership.find({
    orgId: new Types.ObjectId(params.orgId),
  })
    .populate("userId", "name email avatarUrl presenceStatus lastSeenAt")
    .sort({ role: 1, joinedAt: 1 });

  const privileged =
    params.viewerRole === "owner" ||
    params.viewerRole === "admin" ||
    params.viewerRole === "moderator";

  return memberships.map((membership) =>
    toMember(membership, {
      includeEmail:
        privileged || String((membership.userId as never as { _id: unknown })._id) === params.viewerId,
    }),
  );
}

export async function inviteMember(params: {
  orgId: string;
  actorId: string;
  actorRole: Role;
  actorName: string;
  email: string;
  role: Role;
}) {
  if (!assignableRoles(params.actorRole).includes(params.role)) {
    throw forbidden(`You cannot invite someone as ${params.role}`);
  }

  const orgObjectId = new Types.ObjectId(params.orgId);

  const existingUser = await User.findOne({ email: params.email }).select("_id").lean();
  if (existingUser) {
    const already = await Membership.exists({
      userId: existingUser._id,
      orgId: orgObjectId,
    });
    if (already) throw conflict("That person is already in this organization");
  }

  const outstanding = await Invite.findOne({
    email: params.email,
    orgId: orgObjectId,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (outstanding) throw conflict("An invitation is already pending for that email");

  const org = await Organization.findById(orgObjectId).select("name").lean();
  if (!org) throw notFound("Organization");

  const token = generateToken();

  await Invite.create({
    email: params.email,
    orgId: orgObjectId,
    invitedBy: new Types.ObjectId(params.actorId),
    role: params.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const delivered = await sendInviteEmail({
    to: params.email,
    token,
    orgName: org.name,
    inviterName: params.actorName,
    role: params.role,
  });

  if (!delivered) {
    logger.warn({ email: params.email, orgId: params.orgId }, "invite email not delivered");
  }

  return { email: params.email, role: params.role, emailDelivered: delivered };
}

export async function updateMemberRole(params: {
  orgId: string;
  actorId: string;
  actorRole: Role;
  targetUserId: string;
  role: Role;
}) {
  if (params.targetUserId === params.actorId) {
    throw badRequest("You cannot change your own role");
  }

  const membership = await Membership.findOne({
    orgId: new Types.ObjectId(params.orgId),
    userId: new Types.ObjectId(params.targetUserId),
  }).populate("userId", "name email avatarUrl presenceStatus lastSeenAt");

  if (!membership) throw notFound("Member");

  if (!outranks(params.actorRole, membership.role)) {
    throw forbidden(`You cannot modify a ${membership.role}`);
  }
  if (!assignableRoles(params.actorRole).includes(params.role)) {
    throw forbidden(`You cannot assign the ${params.role} role`);
  }

  membership.role = params.role;
  await membership.save();

  return toMember(membership, { includeEmail: true });
}

export async function removeMember(params: {
  orgId: string;
  actorId: string;
  actorRole: Role;
  targetUserId: string;
}) {
  const orgObjectId = new Types.ObjectId(params.orgId);
  const targetObjectId = new Types.ObjectId(params.targetUserId);

  const membership = await Membership.findOne({
    orgId: orgObjectId,
    userId: targetObjectId,
  });
  if (!membership) throw notFound("Member");

  if (membership.role === "owner") {
    throw forbidden("The owner cannot be removed. Transfer ownership first.");
  }
  if (params.targetUserId !== params.actorId && !outranks(params.actorRole, membership.role)) {
    throw forbidden(`You cannot remove a ${membership.role}`);
  }

  await membership.deleteOne();
  await Organization.updateOne({ _id: orgObjectId }, { $inc: { memberCount: -1 } });

  await Conversation.updateMany(
    { orgId: orgObjectId, participantIds: targetObjectId },
    { $pull: { participantIds: targetObjectId } },
  );

  await User.updateOne(
    { _id: targetObjectId, defaultOrgId: orgObjectId },
    { $unset: { defaultOrgId: "" } },
  );

  return { userId: params.targetUserId };
}

export async function transferOwnership(params: {
  orgId: string;
  actorId: string;
  targetUserId: string;
}) {
  const orgObjectId = new Types.ObjectId(params.orgId);

  const target = await Membership.findOne({
    orgId: orgObjectId,
    userId: new Types.ObjectId(params.targetUserId),
    status: "active",
  });
  if (!target) throw notFound("Member");

  const current = await Membership.findOne({
    orgId: orgObjectId,
    userId: new Types.ObjectId(params.actorId),
  });
  if (!current || current.role !== "owner") {
    throw forbidden("Only the owner can transfer ownership");
  }

  target.role = "owner";
  current.role = "admin";
  await Promise.all([target.save(), current.save()]);
  await Organization.updateOne({ _id: orgObjectId }, { $set: { ownerId: target.userId } });

  return { ownerId: params.targetUserId };
}

export async function touchActiveOrg(userId: string, orgId: string) {
  await Promise.all([
    Membership.updateOne(
      { userId: new Types.ObjectId(userId), orgId: new Types.ObjectId(orgId) },
      { $set: { lastActiveAt: new Date() } },
    ),
    User.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { defaultOrgId: new Types.ObjectId(orgId) } },
    ),
  ]);
}
