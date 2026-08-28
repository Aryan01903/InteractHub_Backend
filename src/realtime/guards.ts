import { Types } from "mongoose";
import { Membership } from "../models/membership.model";
import { Conversation } from "../models/conversation.model";
import { Whiteboard } from "../models/board.model";
import { CallRoom } from "../models/callRoom.model";
import { can, type Permission, type Role } from "../config/rbac";

export interface SocketIdentity {
  userId: string;
  orgId: string | null;
  role: Role | null;
}

export async function resolveMembership(
  userId: string,
  orgId: string,
): Promise<Role | null> {
  if (!Types.ObjectId.isValid(orgId)) return null;

  const membership = await Membership.findOne({
    userId: new Types.ObjectId(userId),
    orgId: new Types.ObjectId(orgId),
    status: "active",
  })
    .select("role")
    .lean();

  return membership?.role ?? null;
}

export function hasPermission(
  identity: SocketIdentity,
  permission: Permission,
): boolean {
  return can(identity.role ?? undefined, permission);
}

export async function canAccessConversation(
  identity: SocketIdentity,
  conversationId: string,
): Promise<boolean> {
  if (!identity.orgId || !Types.ObjectId.isValid(conversationId)) return false;

  const conversation = await Conversation.findOne({
    _id: new Types.ObjectId(conversationId),
    orgId: new Types.ObjectId(identity.orgId),
  })
    .select("isPrivate type participantIds")
    .lean();

  if (!conversation) return false;

  const restricted = conversation.isPrivate || conversation.type !== "channel";
  if (!restricted) return true;

  return (conversation.participantIds ?? []).some(
    (participant) => String(participant) === identity.userId,
  );
}

export async function canAccessBoard(
  identity: SocketIdentity,
  boardId: string,
): Promise<boolean> {
  if (!identity.orgId || !Types.ObjectId.isValid(boardId)) return false;

  const board = await Whiteboard.exists({
    _id: new Types.ObjectId(boardId),
    orgId: new Types.ObjectId(identity.orgId),
  });

  return Boolean(board);
}

export async function canAccessCall(
  identity: SocketIdentity,
  roomId: string,
): Promise<boolean> {
  if (!identity.orgId) return false;

  const room = await CallRoom.findOne({ roomId })
    .select("orgId endedAt expiresAt")
    .lean();

  if (!room) return false;
  if (String(room.orgId) !== identity.orgId) return false;
  if (room.endedAt) return false;
  if (room.expiresAt.getTime() < Date.now()) return false;

  return true;
}
