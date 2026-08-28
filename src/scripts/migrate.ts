import mongoose, { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { hashToken, slugify } from "../utils/crypto";
import { fromLegacyRole, type Role } from "../config/rbac";

import { User } from "../models/user.model";
import { Organization } from "../models/organization.model";
import { Membership } from "../models/membership.model";
import { Conversation } from "../models/conversation.model";
import { Message } from "../models/message.model";
import { ReadState } from "../models/readState.model";
import { Invite } from "../models/invite.model";
import { Whiteboard, BoardVersion } from "../models/board.model";
import { CallRoom } from "../models/callRoom.model";


interface Summary {
  organizations: number;
  memberships: number;
  channels: number;
  messages: number;
  readStates: number;
  invites: number;
  boards: number;
  boardVersions: number;
  callRooms: number;
}

async function run(): Promise<Summary> {
  const summary: Summary = {
    organizations: 0,
    memberships: 0,
    channels: 0,
    messages: 0,
    readStates: 0,
    invites: 0,
    boards: 0,
    boardVersions: 0,
    callRooms: 0,
  };

  const db = mongoose.connection.db;
  if (!db) throw new Error("No database connection");

  const tenants = await db.collection("tenants").find({}).toArray();

  for (const tenant of tenants) {
    const orgId = tenant._id as Types.ObjectId;
    const name = (tenant.name as string) ?? "Workspace";

    if (!tenant.slug || !tenant.ownerId) {
      const adminEmails = (tenant.adminEmails as string[] | undefined) ?? [];

      const owner =
        (adminEmails.length > 0
          ? await db
              .collection("users")
              .findOne({ tenantId: orgId, email: { $in: adminEmails } })
          : null) ??
        (await db.collection("users").findOne({ tenantId: orgId, role: "admin" })) ??
        (await db.collection("users").findOne({ tenantId: orgId }));

      let slug = slugify(name) || `workspace-${String(orgId).slice(-6)}`;
      for (let attempt = 1; attempt < 50; attempt += 1) {
        const clash = await db
          .collection("tenants")
          .findOne({ slug, _id: { $ne: orgId } });
        if (!clash) break;
        slug = `${slugify(name)}-${attempt + 1}`;
      }

      await db.collection("tenants").updateOne(
        { _id: orgId },
        {
          $set: {
            slug,
            accent: "#5B7CFA",
            createdAt: tenant.createdAt ?? new Date(),
            updatedAt: new Date(),
            ...(owner ? { ownerId: owner._id } : {}),
          },
        },
      );
      summary.organizations += 1;

      if (!owner) {
        logger.warn(
          { orgId: String(orgId), name },
          "tenant has no users - slugged, but left without an owner or channel",
        );
        continue;
      }
    }

    const users = await db.collection("users").find({ tenantId: orgId }).toArray();
    const org = await Organization.findById(orgId).lean();

    for (const user of users) {
      const isOwner = org?.ownerId && String(org.ownerId) === String(user._id);
      const role: Role = isOwner
        ? "owner"
        : user.role === "admin"
          ? "admin"
          : fromLegacyRole(user.role as string) === "owner"
            ? "admin"
            : "member";

      const result = await Membership.updateOne(
        { userId: user._id, orgId },
        {
          $setOnInsert: {
            userId: user._id,
            orgId,
            role,
            status: "active",
            joinedAt: user.createdAt ?? new Date(),
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount > 0) summary.memberships += 1;

      await db
        .collection("users")
        .updateOne({ _id: user._id }, { $set: { defaultOrgId: orgId } });
    }

    await Organization.updateOne({ _id: orgId }, { $set: { memberCount: users.length } });

    let general = await Conversation.findOne({ orgId, slug: "general" });

    if (!general) {
      const ownerId = (org?.ownerId as Types.ObjectId) ?? users[0]?._id;
      if (!ownerId) continue;

      general = await Conversation.create({
        orgId,
        type: "channel",
        name: "general",
        slug: "general",
        topic: "Everything that matters, in one place.",
        isPrivate: false,
        createdBy: ownerId,
        participantIds: [],
      });
      summary.channels += 1;
    }

    const moved = await db.collection("messages").updateMany(
      { tenantId: orgId, conversationId: { $exists: false } },
      { $set: { orgId, conversationId: general._id } },
    );
    summary.messages += moved.modifiedCount;

    const withFiles = await db
      .collection("messages")
      .find({ conversationId: general._id, files: { $exists: true, $ne: [] } })
      .toArray();

    for (const message of withFiles) {
      const attachments = ((message.files as Record<string, unknown>[]) ?? [])
        .map((file) => ({
          url: (file.secure_url as string) ?? "",
          name: (file.original_filename as string) ?? "attachment",
          type: (file.mimetype as string) ?? "application/octet-stream",
          size: file.size as number | undefined,
          publicId: file.public_id as string | undefined,
        }))
        .filter((attachment) => attachment.url);

      await db
        .collection("messages")
        .updateOne(
          { _id: message._id },
          { $set: { attachments }, $unset: { files: "" } },
        );
    }

    const newest = await Message.findOne({ conversationId: general._id })
      .select("_id")
      .sort({ _id: -1 })
      .lean();

    if (newest) {
      for (const user of users) {
        const result = await ReadState.updateOne(
          { userId: user._id, conversationId: general._id },
          {
            $setOnInsert: {
              userId: user._id,
              orgId,
              conversationId: general._id,
              lastReadMessageId: newest._id,
              lastReadAt: new Date(),
              mentionCount: 0,
            },
          },
          { upsert: true },
        );
        if (result.upsertedCount > 0) summary.readStates += 1;
      }

      await Conversation.updateOne(
        { _id: general._id },
        { $set: { lastMessageId: newest._id, lastMessageAt: new Date() } },
      );
    }

    await db
      .collection("messages")
      .updateMany(
        { conversationId: general._id },
        { $unset: { readBy: "", tenantId: "", files: "" } },
      );
  }

  const invites = await db
    .collection("invites")
    .find({ token: { $exists: true } })
    .toArray();

  for (const invite of invites) {
    await db.collection("invites").updateOne(
      { _id: invite._id },
      {
        $set: {
          tokenHash: hashToken(invite.token as string),
          orgId: invite.tenantId ?? invite.orgId,
          ...(invite.used ? { usedAt: invite.updatedAt ?? new Date() } : {}),
        },
        $unset: { token: "", used: "", tenantId: "", tenantName: "" },
      },
    );
    summary.invites += 1;
  }

  const boards = await db
    .collection("whiteboards")
    .find({ tenantId: { $exists: true } })
    .toArray();

  for (const board of boards) {
    const orgId = board.tenantId as Types.ObjectId;
    const versions = (board.versions as Record<string, unknown>[] | undefined) ?? [];

    for (const version of versions) {
      await BoardVersion.create({
        boardId: board._id,
        orgId,
        data: version.data,
        createdBy: board.createdBy,
        ...(version.createdAt ? { createdAt: version.createdAt } : {}),
      });
      summary.boardVersions += 1;
    }

    await db
      .collection("whiteboards")
      .updateOne(
        { _id: board._id },
        { $set: { orgId }, $unset: { tenantId: "", versions: "" } },
      );
    summary.boards += 1;
  }

  const rooms = await db
    .collection("videorooms")
    .find({ tenantId: { $exists: true } })
    .toArray();

  for (const room of rooms) {
    await db.collection("videorooms").updateOne(
      { _id: room._id },
      {
        $set: {
          orgId: room.tenantId,
          title: room.title ?? "Team Meeting",
          expiresAt: room.expiresAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000),
        },
        $unset: { tenantId: "" },
      },
    );
    summary.callRooms += 1;
  }

  await db
    .collection("users")
    .updateMany({}, { $unset: { role: "", tenantName: "", tenantId: "", otp: "", otpExpires: "" } });

  for (const model of [
    User,
    Organization,
    Membership,
    Conversation,
    Message,
    ReadState,
    Invite,
    Whiteboard,
    BoardVersion,
    CallRoom,
  ]) {
    await model.syncIndexes();
    logger.info(`indexes synced: ${model.modelName}`);
  }

  return summary;
}

async function main() {
  await mongoose.connect(env.DB_URL);
  logger.info("connected - starting migration");

  try {
    const summary = await run();
    logger.info(summary, "migration complete");
  } finally {
    await mongoose.connection.close();
  }
}

void main().catch((error) => {
  logger.fatal({ err: error }, "migration failed");
  process.exit(1);
});
