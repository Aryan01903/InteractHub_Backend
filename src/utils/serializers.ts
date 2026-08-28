import type { Types } from "mongoose";
import type { Role } from "../config/rbac";
import { permissionsFor } from "../config/rbac";
import type { UserDocument } from "../models/user.model";
import type { OrganizationDocument } from "../models/organization.model";
import type { MembershipDocument } from "../models/membership.model";
import type { ConversationDocument } from "../models/conversation.model";
import type { MessageDocument } from "../models/message.model";
import type { WhiteboardDocument } from "../models/board.model";
import type { CallRoomDocument } from "../models/callRoom.model";

const id = (value: unknown): string =>
  value && typeof value === "object" && "_id" in (value as object)
    ? String((value as { _id: unknown })._id)
    : String(value ?? "");

const isPopulated = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && "name" in (value as object);

export interface UserSummaryDTO {
  _id: string;
  name: string;
  avatarUrl: string | null;
  presenceStatus: string;
}

export function toUserSummary(user: unknown): UserSummaryDTO | null {
  if (!user) return null;
  if (!isPopulated(user)) {
    return {
      _id: id(user),
      name: "Unknown member",
      avatarUrl: null,
      presenceStatus: "offline",
    };
  }
  return {
    _id: id(user),
    name: String(user.name ?? "Unknown member"),
    avatarUrl: (user.avatarUrl as string) ?? null,
    presenceStatus: (user.presenceStatus as string) ?? "offline",
  };
}

export interface ViewerDTO extends UserSummaryDTO {
  email: string;
  isVerified: boolean;
  defaultOrgId: string | null;
  createdAt: string;
}

export function toViewer(user: UserDocument): ViewerDTO {
  return {
    _id: id(user),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    presenceStatus: user.presenceStatus ?? "offline",
    isVerified: user.isVerified,
    defaultOrgId: user.defaultOrgId ? String(user.defaultOrgId) : null,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface OrganizationDTO {
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  accent: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

export function toOrganization(org: OrganizationDocument): OrganizationDTO {
  return {
    _id: id(org),
    name: org.name,
    slug: org.slug,
    description: org.description ?? null,
    avatarUrl: org.avatarUrl ?? null,
    accent: org.accent ?? "#5B7CFA",
    ownerId: String(org.ownerId),
    memberCount: org.memberCount ?? 0,
    createdAt: org.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface OrganizationMembershipDTO extends OrganizationDTO {
  role: Role;
  permissions: readonly string[];
  joinedAt: string;
}

export function toOrganizationMembership(
  org: OrganizationDocument,
  membership: Pick<MembershipDocument, "role" | "joinedAt">,
): OrganizationMembershipDTO {
  return {
    ...toOrganization(org),
    role: membership.role,
    permissions: permissionsFor(membership.role),
    joinedAt: membership.joinedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface MemberDTO {
  _id: string;
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  status: string;
  presenceStatus: string;
  lastSeenAt: string | null;
  joinedAt: string;
}

export function toMember(
  membership: MembershipDocument,
  options: { includeEmail: boolean } = { includeEmail: false },
): MemberDTO {
  const user = membership.userId as unknown;
  const populated = isPopulated(user) ? user : null;

  return {
    _id: id(membership),
    userId: id(user),
    name: String(populated?.name ?? "Unknown member"),
    email: options.includeEmail ? ((populated?.email as string) ?? null) : null,
    avatarUrl: (populated?.avatarUrl as string) ?? null,
    role: membership.role,
    status: membership.status,
    presenceStatus: (populated?.presenceStatus as string) ?? "offline",
    lastSeenAt: populated?.lastSeenAt
      ? new Date(populated.lastSeenAt as Date).toISOString()
      : null,
    joinedAt: membership.joinedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface ConversationDTO {
  _id: string;
  orgId: string;
  type: string;
  name: string | null;
  slug: string | null;
  topic: string | null;
  isPrivate: boolean;
  createdBy: string;
  participants: UserSummaryDTO[];
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  mentionCount: number;
  isArchived: boolean;
  createdAt: string;
}

export function toConversation(
  conversation: ConversationDocument,
  extras: { unreadCount?: number; mentionCount?: number } = {},
): ConversationDTO {
  const participants = Array.isArray(conversation.participantIds)
    ? (conversation.participantIds
        .map(toUserSummary)
        .filter(Boolean) as UserSummaryDTO[])
    : [];

  return {
    _id: id(conversation),
    orgId: String(conversation.orgId),
    type: conversation.type,
    name: conversation.name ?? null,
    slug: conversation.slug ?? null,
    topic: conversation.topic ?? null,
    isPrivate: conversation.isPrivate,
    createdBy: id(conversation.createdBy),
    participants,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: conversation.lastMessagePreview ?? null,
    unreadCount: extras.unreadCount ?? 0,
    mentionCount: extras.mentionCount ?? 0,
    isArchived: Boolean(conversation.archivedAt),
    createdAt: conversation.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface ReactionDTO {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageDTO {
  _id: string;
  conversationId: string;
  orgId: string;
  sender: UserSummaryDTO | null;
  content: string;
  type: string;
  attachments: MessageDocument["attachments"];
  reactions: ReactionDTO[];
  replyTo: {
    _id: string;
    content: string;
    sender: UserSummaryDTO | null;
  } | null;
  mentions: string[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
}

export function toMessage(message: MessageDocument): MessageDTO {
  const replyTo = message.replyTo as unknown;
  const replyPopulated =
    replyTo && typeof replyTo === "object" && "content" in (replyTo as object)
      ? (replyTo as { _id: unknown; content: string; sender: unknown })
      : null;

  const deleted = Boolean(message.deletedAt);

  return {
    _id: id(message),
    conversationId: String(message.conversationId),
    orgId: String(message.orgId),
    sender: toUserSummary(message.sender),
    content: deleted ? "" : message.content,
    type: message.type,
    attachments: deleted ? [] : (message.attachments ?? []),
    reactions: deleted
      ? []
      : (message.reactions ?? []).map((reaction) => ({
          emoji: reaction.emoji,
          count: reaction.userIds?.length ?? 0,
          userIds: (reaction.userIds ?? []).map((userId) => String(userId)),
        })),
    replyTo: replyPopulated
      ? {
          _id: id(replyPopulated),
          content: String(replyPopulated.content ?? "").slice(0, 140),
          sender: toUserSummary(replyPopulated.sender),
        }
      : replyTo
        ? { _id: id(replyTo), content: "", sender: null }
        : null,
    mentions: (message.mentions ?? []).map((m: Types.ObjectId) => String(m)),
    isEdited: Boolean(message.editedAt),
    isDeleted: deleted,
    createdAt: message.createdAt?.toISOString() ?? new Date().toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

export interface WhiteboardDTO {
  _id: string;
  name: string;
  orgId: string;
  createdBy: UserSummaryDTO | null;
  lastEditedBy: UserSummaryDTO | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toWhiteboardSummary(board: WhiteboardDocument): WhiteboardDTO {
  return {
    _id: id(board),
    name: board.name,
    orgId: String(board.orgId),
    createdBy: toUserSummary(board.createdBy),
    lastEditedBy: board.lastEditedBy ? toUserSummary(board.lastEditedBy) : null,
    thumbnail: board.thumbnail ?? null,
    createdAt: board.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: board.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function toWhiteboard(
  board: WhiteboardDocument,
): WhiteboardDTO & { data: unknown } {
  return { ...toWhiteboardSummary(board), data: board.data ?? null };
}

export interface CallRoomDTO {
  _id: string;
  roomId: string;
  title: string;
  orgId: string;
  createdBy: UserSummaryDTO | null;
  conversationId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export function toCallRoom(room: CallRoomDocument): CallRoomDTO {
  const now = Date.now();
  return {
    _id: id(room),
    roomId: room.roomId,
    title: room.title,
    orgId: String(room.orgId),
    createdBy: toUserSummary(room.createdBy),
    conversationId: room.conversationId ? String(room.conversationId) : null,
    scheduledAt: room.scheduledAt?.toISOString() ?? null,
    startedAt: room.startedAt?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
    expiresAt: room.expiresAt.toISOString(),
    isActive: !room.endedAt && room.expiresAt.getTime() > now,
    createdAt: room.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
