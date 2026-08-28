import type { Server } from "socket.io";
import { SOCKET_EVENTS, rooms, type PresenceStatus } from "../config/events";
import { User } from "../models/user.model";
import { Types } from "mongoose";

interface PresenceEntry {
  sockets: Set<string>;
  status: PresenceStatus;
  name: string;
}

const byOrg = new Map<string, Map<string, PresenceEntry>>();

function orgMap(orgId: string): Map<string, PresenceEntry> {
  let map = byOrg.get(orgId);
  if (!map) {
    map = new Map();
    byOrg.set(orgId, map);
  }
  return map;
}

export function snapshot(orgId: string) {
  const map = byOrg.get(orgId);
  if (!map) return [];

  return [...map.entries()]
    .filter(([, entry]) => entry.sockets.size > 0)
    .map(([userId, entry]) => ({
      userId,
      name: entry.name,
      status: entry.status,
    }));
}

export function join(
  io: Server,
  params: { orgId: string; userId: string; socketId: string; name: string },
) {
  const map = orgMap(params.orgId);
  let entry = map.get(params.userId);

  const wasOffline = !entry || entry.sockets.size === 0;

  if (!entry) {
    entry = { sockets: new Set(), status: "online", name: params.name };
    map.set(params.userId, entry);
  }
  entry.sockets.add(params.socketId);
  entry.name = params.name;
  if (wasOffline) entry.status = "online";

  if (wasOffline) {
    io.to(rooms.org(params.orgId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
      userId: params.userId,
      name: entry.name,
      status: entry.status,
    });
  }
}

export async function leave(
  io: Server,
  params: { orgId: string; userId: string; socketId: string },
) {
  const map = byOrg.get(params.orgId);
  const entry = map?.get(params.userId);
  if (!map || !entry) return;

  entry.sockets.delete(params.socketId);
  if (entry.sockets.size > 0) return;

  entry.status = "offline";
  map.delete(params.userId);
  if (map.size === 0) byOrg.delete(params.orgId);

  io.to(rooms.org(params.orgId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
    userId: params.userId,
    name: entry.name,
    status: "offline",
  });

  if (Types.ObjectId.isValid(params.userId)) {
    await User.updateOne(
      { _id: new Types.ObjectId(params.userId) },
      { $set: { lastSeenAt: new Date(), presenceStatus: "offline" } },
    ).catch(() => undefined);
  }
}

export function setStatus(
  io: Server,
  params: { orgId: string; userId: string; status: PresenceStatus },
) {
  const entry = byOrg.get(params.orgId)?.get(params.userId);
  if (!entry || entry.status === params.status) return;

  entry.status = params.status;
  io.to(rooms.org(params.orgId)).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
    userId: params.userId,
    name: entry.name,
    status: params.status,
  });

  if (Types.ObjectId.isValid(params.userId)) {
    void User.updateOne(
      { _id: new Types.ObjectId(params.userId) },
      { $set: { presenceStatus: params.status } },
    ).catch(() => undefined);
  }
}

export function reset() {
  byOrg.clear();
}
