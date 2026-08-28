import { Types } from "mongoose";
import { Message, type MessageDocument } from "../../models/message.model";
import { Conversation } from "../../models/conversation.model";
import { Membership } from "../../models/membership.model";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../utils/cursor";
import { toMessage, type MessageDTO } from "../../utils/serializers";
import { can, type Role } from "../../config/rbac";
import { getConversation } from "../conversation/conversation.service";

const oid = (value: string) => new Types.ObjectId(value);

const HYDRATE = [
  { path: "sender", select: "name avatarUrl presenceStatus" },
  {
    path: "replyTo",
    select: "content sender",
    populate: { path: "sender", select: "name avatarUrl presenceStatus" },
  },
] as const;

export async function listMessages(params: {
  orgId: string;
  userId: string;
  conversationId: string;
  limit: number;
  before?: string;
  after?: string;
}): Promise<{ items: MessageDTO[]; nextCursor: string | null }> {
  await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
  });

  const filter: Record<string, unknown> = {
    conversationId: oid(params.conversationId),
  };

  const before = decodeCursor(params.before, "before cursor");
  const after = decodeCursor(params.after, "after cursor");

  if (before) filter._id = { $lt: before };
  if (after) filter._id = { ...(filter._id as object), $gt: after };

  const rows = await Message.find(filter)
    .populate(HYDRATE as never)
    .sort({ _id: -1 })
    .limit(params.limit + 1)
    .lean<MessageDocument[]>();

  const { items, nextCursor } = slicePage(rows, params.limit, (row) => row._id);

  return {
    items: items.map(toMessage).reverse(),
    nextCursor,
  };
}

export async function getMessageContext(params: {
  orgId: string;
  userId: string;
  conversationId: string;
  messageId: string;
  radius: number;
}) {
  await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
  });

  if (!Types.ObjectId.isValid(params.messageId)) throw notFound("Message");
  const anchor = oid(params.messageId);
  const conversationId = oid(params.conversationId);

  const [older, newer] = await Promise.all([
    Message.find({ conversationId, _id: { $lte: anchor } })
      .populate(HYDRATE as never)
      .sort({ _id: -1 })
      .limit(params.radius + 1)
      .lean<MessageDocument[]>(),
    Message.find({ conversationId, _id: { $gt: anchor } })
      .populate(HYDRATE as never)
      .sort({ _id: 1 })
      .limit(params.radius)
      .lean<MessageDocument[]>(),
  ]);

  if (older.length === 0) throw notFound("Message");

  const items = [...older.reverse(), ...newer].map(toMessage);
  const oldest = older[0];

  return {
    items,
    nextCursor: oldest ? encodeCursor(oldest._id) : null,
    anchorId: params.messageId,
  };
}

async function verifyMentions(orgId: string, mentions: string[]) {
  const candidates = [...new Set(mentions)].filter((id) => Types.ObjectId.isValid(id));
  if (candidates.length === 0) return [];

  const verified = await Membership.find({
    orgId: oid(orgId),
    userId: { $in: candidates.map(oid) },
    status: "active",
  })
    .select("userId")
    .lean();

  return verified.map((membership) => membership.userId as Types.ObjectId);
}

export async function sendMessage(params: {
  orgId: string;
  userId: string;
  conversationId: string;
  content: string;
  attachments: MessageDocument["attachments"];
  replyTo?: string;
  mentions: string[];
}) {
  const conversation = await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.conversationId,
  });

  const content = params.content.trim();
  if (!content && params.attachments.length === 0) {
    throw badRequest("Write something or attach a file");
  }

  let replyTo: Types.ObjectId | undefined;
  if (params.replyTo) {
    if (!Types.ObjectId.isValid(params.replyTo)) throw badRequest("Invalid reply target");
    const parent = await Message.exists({
      _id: oid(params.replyTo),
      conversationId: conversation._id,
    });
    if (!parent) throw notFound("The message being replied to");
    replyTo = oid(params.replyTo);
  }

  const type =
    params.attachments.length === 0
      ? "text"
      : params.attachments[0]?.type.startsWith("image/")
        ? "image"
        : "file";

  const message = await Message.create({
    orgId: oid(params.orgId),
    conversationId: conversation._id,
    sender: oid(params.userId),
    content,
    type,
    attachments: params.attachments,
    ...(replyTo ? { replyTo } : {}),
    mentions: await verifyMentions(params.orgId, params.mentions),
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessageId: message._id,
        lastMessagePreview: content
          ? content.slice(0, 140)
          : `Sent ${params.attachments.length} attachment${params.attachments.length === 1 ? "" : "s"}`,
      },
    },
  );

  await message.populate(HYDRATE as never);
  return toMessage(message);
}

export async function editMessage(params: {
  orgId: string;
  userId: string;
  messageId: string;
  content: string;
}) {
  if (!Types.ObjectId.isValid(params.messageId)) throw notFound("Message");

  const message = await Message.findOne({
    _id: oid(params.messageId),
    orgId: oid(params.orgId),
  });
  if (!message || message.deletedAt) throw notFound("Message");

  if (String(message.sender) !== params.userId) {
    throw forbidden("You can only edit your own messages");
  }

  const content = params.content.trim();
  if (!content) throw badRequest("A message cannot be empty");

  message.content = content;
  message.editedAt = new Date();
  await message.save();

  await Conversation.updateOne(
    { _id: message.conversationId, lastMessageId: message._id },
    { $set: { lastMessagePreview: content.slice(0, 140) } },
  );

  await message.populate(HYDRATE as never);
  return toMessage(message);
}

export async function deleteMessage(params: {
  orgId: string;
  userId: string;
  role: Role;
  messageId: string;
}) {
  if (!Types.ObjectId.isValid(params.messageId)) throw notFound("Message");

  const message = await Message.findOne({
    _id: oid(params.messageId),
    orgId: oid(params.orgId),
  });
  if (!message || message.deletedAt) throw notFound("Message");

  const isAuthor = String(message.sender) === params.userId;
  if (!isAuthor && !can(params.role, "message:delete:any")) {
    throw forbidden("You can only delete your own messages");
  }

  message.deletedAt = new Date();
  message.content = "";
  message.attachments = [];
  message.reactions = [];
  await message.save();

  await Conversation.updateOne(
    { _id: message.conversationId, lastMessageId: message._id },
    { $set: { lastMessagePreview: "Message deleted" } },
  );

  return {
    messageId: params.messageId,
    conversationId: String(message.conversationId),
  };
}

export async function toggleReaction(params: {
  orgId: string;
  userId: string;
  messageId: string;
  emoji: string;
}) {
  if (!Types.ObjectId.isValid(params.messageId)) throw notFound("Message");

  const emoji = params.emoji.trim();
  if (!emoji || emoji.length > 16) throw badRequest("Invalid reaction");

  const messageId = oid(params.messageId);
  const orgId = oid(params.orgId);
  const userId = oid(params.userId);

  const message = await Message.findOne({ _id: messageId, orgId });
  if (!message || message.deletedAt) throw notFound("Message");

  await getConversation({
    orgId: params.orgId,
    userId: params.userId,
    conversationId: String(message.conversationId),
  });

  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
  const reacted = existing?.userIds.some((id) => String(id) === params.userId) ?? false;

  if (reacted) {
    await Message.updateOne(
      { _id: messageId, "reactions.emoji": emoji },
      { $pull: { "reactions.$.userIds": userId } },
    );
    await Message.updateOne(
      { _id: messageId },
      { $pull: { reactions: { userIds: { $size: 0 } } } },
    );
  } else if (existing) {
    await Message.updateOne(
      { _id: messageId, "reactions.emoji": emoji },
      { $addToSet: { "reactions.$.userIds": userId } },
    );
  } else {
    await Message.updateOne(
      { _id: messageId, "reactions.emoji": { $ne: emoji } },
      { $push: { reactions: { emoji, userIds: [userId] } } },
    );
  }

  const updated = await Message.findById(messageId).populate(HYDRATE as never);
  if (!updated) throw notFound("Message");
  return toMessage(updated);
}
