import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS, rooms } from "../config/events";
import { canAccessCall } from "./guards";

interface Participant {
  socketId: string;
  userId: string;
  name: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
}

const participants = new Map<string, Map<string, Participant>>();

function peersIn(roomId: string): Participant[] {
  return [...(participants.get(roomId)?.values() ?? [])];
}

function sharesCall(socket: Socket, targetSocketId: string): boolean {
  const roomId = socket.state.callRoomId;
  if (!roomId) return false;

  const room = participants.get(roomId);
  if (!room) return false;

  return room.has(socket.id) && room.has(targetSocketId);
}

export function registerCallHandlers(io: Server, socket: Socket) {
  const state = socket.state;

  socket.on(SOCKET_EVENTS.CALL_JOIN, async (payload: { roomId?: string } = {}) => {
    const roomId = payload?.roomId;
    if (!roomId || state.callRoomId === roomId) return;

    if (!(await canAccessCall(state, roomId))) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        event: SOCKET_EVENTS.CALL_JOIN,
        message: "That meeting is not available",
      });
      return;
    }

    if (state.callRoomId) leaveCall(io, socket);

    await socket.join(rooms.call(roomId));
    state.callRoomId = roomId;

    let room = participants.get(roomId);
    if (!room) {
      room = new Map();
      participants.set(roomId, room);
    }

    const self: Participant = {
      socketId: socket.id,
      userId: state.userId,
      name: state.name,
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
    };

    const existing = peersIn(roomId);
    room.set(socket.id, self);

    socket.emit(SOCKET_EVENTS.CALL_PEERS, { roomId, peers: existing });

    socket.to(rooms.call(roomId)).emit(SOCKET_EVENTS.CALL_PEER_JOINED, {
      roomId,
      peer: self,
    });
  });

  socket.on(SOCKET_EVENTS.CALL_LEAVE, () => leaveCall(io, socket));

  socket.on(
    SOCKET_EVENTS.CALL_OFFER,
    (payload: { to?: string; offer?: unknown } = {}) => {
      if (!payload?.to || !payload.offer) return;
      if (!sharesCall(socket, payload.to)) return;

      io.to(payload.to).emit(SOCKET_EVENTS.CALL_OFFER, {
        from: socket.id,
        userId: state.userId,
        name: state.name,
        offer: payload.offer,
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CALL_ANSWER,
    (payload: { to?: string; answer?: unknown } = {}) => {
      if (!payload?.to || !payload.answer) return;
      if (!sharesCall(socket, payload.to)) return;

      io.to(payload.to).emit(SOCKET_EVENTS.CALL_ANSWER, {
        from: socket.id,
        userId: state.userId,
        answer: payload.answer,
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CALL_ICE_CANDIDATE,
    (payload: { to?: string; candidate?: unknown } = {}) => {
      if (!payload?.to || !payload.candidate) return;
      if (!sharesCall(socket, payload.to)) return;

      io.to(payload.to).emit(SOCKET_EVENTS.CALL_ICE_CANDIDATE, {
        from: socket.id,
        candidate: payload.candidate,
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CALL_MEDIA_STATE,
    (
      payload: {
        audioEnabled?: boolean;
        videoEnabled?: boolean;
        screenSharing?: boolean;
      } = {},
    ) => {
      const roomId = state.callRoomId;
      if (!roomId) return;

      const self = participants.get(roomId)?.get(socket.id);
      if (!self) return;

      if (typeof payload.audioEnabled === "boolean") {
        self.audioEnabled = payload.audioEnabled;
      }
      if (typeof payload.videoEnabled === "boolean") {
        self.videoEnabled = payload.videoEnabled;
      }
      if (typeof payload.screenSharing === "boolean") {
        self.screenSharing = payload.screenSharing;
      }

      socket.to(rooms.call(roomId)).emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        socketId: socket.id,
        userId: state.userId,
        audioEnabled: self.audioEnabled,
        videoEnabled: self.videoEnabled,
        screenSharing: self.screenSharing,
      });
    },
  );

  socket.on(SOCKET_EVENTS.CALL_SPEAKING, (payload: { speaking?: boolean } = {}) => {
    const roomId = state.callRoomId;
    if (!roomId || typeof payload?.speaking !== "boolean") return;

    socket.to(rooms.call(roomId)).emit(SOCKET_EVENTS.CALL_SPEAKING, {
      socketId: socket.id,
      userId: state.userId,
      speaking: payload.speaking,
    });
  });
}

function leaveCall(io: Server, socket: Socket) {
  const roomId = socket.state.callRoomId;
  if (!roomId) return;

  participants.get(roomId)?.delete(socket.id);
  if (participants.get(roomId)?.size === 0) participants.delete(roomId);

  socket.to(rooms.call(roomId)).emit(SOCKET_EVENTS.CALL_PEER_LEFT, {
    roomId,
    socketId: socket.id,
    userId: socket.state.userId,
  });

  void socket.leave(rooms.call(roomId));
  socket.state.callRoomId = null;
}

export function dropFromCalls(io: Server, socket: Socket) {
  leaveCall(io, socket);
}
