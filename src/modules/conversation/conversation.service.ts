import { Types } from "mongoose";
import { Conversation, type ConversationDocument } from "../../models/conversation.model";
import { Message } from "../../models/message.model";
import { ReadState } from "../../models/readState.model";
import { Membership } from "../../models/membership.model";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors";
import { slugify } from "../../utils/crypto";
import { toConversation, type ConversationDTO } from "../../utils/serializers";
import { outranks, type Role } from "../../config/rbac";

const oid = (value: string) => new Types.ObjectId(value);

function visibilityFilter(orgId: string, userId: string) {
  return {
    orgId: oid(orgId),
    $or: [
      { type: "channel", isPrivate: false },
      { participantIds: oid(userId) },
    ],
  };
}

async function unreadCounts(params: {
  conversationIds: Types.ObjectId[];
  userId: string;
}): Promise<Map<string, { unreadCount: number; mentionCount: number }>> {
  const result = new Map<string, { unreadCount: number; mentionCount: number }>();
  if (params.conversationIds.length === 0) return result;

  const userObjectId = oid(params.userId);

  const readStates = await ReadState.find({
    userId: userObjectId,
    conversationId: { $in: params.conversationIds },
  })
    .select("conversationId lastReadMessageId")
    .lean();

  const cursorByConversation = new Map<string, Types.ObjectId | null>();
  for (const state of readStates) {
    cursorByConversation.set(
      String(state.conversationId),
      (state.lastReadMessageId as Types.ObjectId | undefined) ?? null,
    );
  }

  const branches = params.conversationIds.map((conversationId) => {
    const cursor = cursorByConversation.get(String(conversationId));
    return cursor
      ? { conversationId, _id: { $gt: cursor } }
      :
        { conversationId };
  });

  const rows = await Message.aggregate<{
    _id: Types.ObjectId;
    unreadCount: number;
    mentionCount: number;
  }>([
    {
      $match: {
        $or: branches,
        deletedAt: { $exists: false },
        sender: { $ne: userObjectId },
      },
    },
    {
      $group: {
        _id: "$conversationId",
        unreadCount: { $sum: 1 },
        mentionCount: {
          $sum: { $cond: [{ $in: [userObjectId, "$mentions"] }, 1, 0] },
        },
      },
    },
  ]);

  for (const row of rows) {
    result.set(String(row._id), {
      unreadCount: row.unreadCount,
      mentionCount: row.mentionCount,
    });
  }

  return result;
}

export async function listConversations(params: {
  orgId: string;
  userId: string;
}): Promise<ConversationDTO[]> {
  const conversations = await Conversation.find({
    ...visibilityFilter(params.orgId, params.userId),
    archivedAt: { $exists: false },
  })
    .populate("participantIds", "name avatarUrl presenceStatus")
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(200);

  const counts = await unreadCounts({
    conversationIds: conversations.map((conversation) => conversation._id),
    userId: params.userId,
  });

  return conversations.map((conversation) =>
    toConversation(conversation, counts.get(String(conversation._id)) ?? {}),
  );
}

export async function getConversation(params: {
  orgId: string;
  userId: string;
  conversationId: string;
}): Promise<ConversationDocument> {
  if (!Types.ObjectId.isValid(params.conversationId)) throw notFound("Conversation");

  const conversation = await Conversation.findOne({
    _id: oid(params.conversationId),
    ...visibilityFilter(params.orgId, params.userId),
  }).populate("participantIds", "name avatarUrl presenceStatus");

  if (!conversation) throw notFound("Conversation");
  return conversation;
}

export async function createConversation(params: {
  orgId: string;
  userId: string;
  type: "channel" | "group";
  name: string;
  topic?: string;
  isPrivate: boolean;
  participantIds: string[];
}) {
  const orgObjectId = oid(params.orgId);
  const creator = oid(params.userId);

  const slug = params.type === "channel" ? slugify(params.name) : undefined;
  if (params.type === "channel" && !slug) {
    throw badRequest("Enter a channel name using letters or numbers");
  }

  if (slug) {
    const existing = await Conversation.exists({ orgId: orgObjectId, slug });
    if (existing) throw conflict(`#${slug} already exists`);
  }

  const requested = [...new Set(params.participantIds)].filter((id) =>
    Types.ObjectId.isValid(id),
  );

  let participants: Types.ObjectId[] = [];
  if (params.isPrivate || params.type === "group") {
    const verified = await Membership.find({
      orgId: orgObjectId,
      userId: { $in: requested.map(oid) },
      status: "active",
    })
      .select("userId")
      .lean();

    participants = verified.map((membership) => membership.userId as Types.ObjectId);
    if (!participants.some((id) => id.equals(creator))) participants.push(creator);
  }

  const conversation = await Conversation.create({
    orgId: orgObjectId,
    type: params.type,
    name: params.name.trim(),
    ...(slug ? { slug } : {}),
    ...(params.topic ? { topic: params.topic.trim() } : {}),
    isPrivate: params.isPrivate,
    createdBy: creator,
    participantIds: participants,
  });

  await conversation.populate("participantIds", "name avatarUrl presenceStatus");
  return toConversation(conversation);
}

export async function ensureDirectMessage(params: {
  orgId: string;
  userId: string;
  targetUserId: string;
}) {
  if (params.userId === params.targetUserId) {
    throw badRequest("You cannot start a direct message with yourself");
  }
  if (!Types.ObjectId.isValid(params.targetUserId)) throw notFound("Member");

  const orgObjectId = oid(params.orgId);
  const self = oid(params.userId);
  const other = oid(params.targetUserId);

  const target = await Membership.exists({
    orgId: orgObjectId,
    userId: other,
    status: "active",
  });
  if (!target) throw notFound("Member");

  const existing = await Conversation.findOne({
    orgId: orgObjectId,
    type: "dm",
    participantIds: { $all: [self, other], $size: 2 },
  }).populate("participantIds", "name avatarUrl presenceStatus");

  if (existing) return toConversation(existing);

  const conversation = await Conversation.create({
    orgId: orgObjectId,
    type: "dm",
    isPrivate: true,
    createdBy: self,
    participantIds: [self, other],
  });

  await conversation.populate("participantIds", "name avatarUrl presenceStatus");
  return toConversation(conversation);
}

export async function updateConversation(params: {
  orgId: string;
  userId: string;
  role: Role;
  conversationId: string;
  patch: { name?: string; topic?: string; participantIds?: string[] };
}) {
  const conversation = await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
  });

  if (conversation.type === "dm") {
    throw badRequest("Direct messages cannot be renamed");
  }

  if (params.patch.name !== undefined) {
    conversation.name = params.patch.name.trim();
    if (conversation.type === "channel") {
      const slug = slugify(conversation.name);
      if (slug && slug !== conversation.slug) {
        const clash = await Conversation.exists({
          orgId: oid(params.orgId),
          slug,
          _id: { $ne: conversation._id },
        });
        if (clash) throw conflict(`#${slug} already exists`);
        conversation.slug = slug;
      }
    }
  }

  if (params.patch.topic !== undefined) conversation.topic = params.patch.topic.trim();

  if (params.patch.participantIds) {
    const verified = await Membership.find({
      orgId: oid(params.orgId),
      userId: { $in: params.patch.participantIds.filter(Types.ObjectId.isValid).map(oid) },
      status: "active",
    })
      .select("userId")
      .lean();
    conversation.participantIds = verified.map(
      (membership) => membership.userId as Types.ObjectId,
    );
  }

  await conversation.save();
  await conversation.populate("participantIds", "name avatarUrl presenceStatus");
  return toConversation(conversation);
}

export async function deleteConversation(params: {
  orgId: string;
  userId: string;
  role: Role;
  conversationId: string;
}) {
  const conversation = await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
  });

  const isCreator = String(conversation.createdBy) === params.userId;
  if (!isCreator && !outranks(params.role, "member")) {
    throw forbidden("Only the creator or an admin can delete this channel");
  }

  await Promise.all([
    Message.deleteMany({ conversationId: conversation._id }),
    ReadState.deleteMany({ conversationId: conversation._id }),
    conversation.deleteOne(),
  ]);

  return { conversationId: params.conversationId };
}

export async function markRead(params: {
  orgId: string;
  userId: string;
  conversationId: string;
  messageId?: string;
}) {
  const conversationId = oid(params.conversationId);

  const latest = params.messageId && Types.ObjectId.isValid(params.messageId)
    ? oid(params.messageId)
    : (
        await Message.findOne({ conversationId })
          .select("_id")
          .sort({ _id: -1 })
          .lean()
      )?._id;

  if (!latest) {
    return { conversationId: params.conversationId, lastReadMessageId: null };
  }

  const existing = await ReadState.findOne({
    userId: oid(params.userId),
    conversationId,
  }).select("lastReadMessageId");

  if (existing?.lastReadMessageId && existing.lastReadMessageId >= latest) {
    return {
      conversationId: params.conversationId,
      lastReadMessageId: String(existing.lastReadMessageId),
    };
  }

  await ReadState.updateOne(
    { userId: oid(params.userId), conversationId },
    {
      $set: {
        orgId: oid(params.orgId),
        lastReadMessageId: latest,
        lastReadAt: new Date(),
        mentionCount: 0,
      },
    },
    { upsert: true },
  );

  return {
    conversationId: params.conversationId,
    lastReadMessageId: String(latest),
  };
}

export { visibilityFilter };
