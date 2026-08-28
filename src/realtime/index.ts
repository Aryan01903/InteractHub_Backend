import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { FastifyInstance } from "fastify";

type JwtCapable = Pick<FastifyInstance, "jwt">;
import { allowedOrigins } from "../config/env";
import { SOCKET_EVENTS, rooms, PRESENCE_STATUSES, type PresenceStatus } from "../config/events";
import { logger } from "../utils/logger";
import type { Role } from "../config/rbac";
import {
  canAccessBoard,
  canAccessCall,
  canAccessConversation,
  hasPermission,
  resolveMembership,
  type SocketIdentity,
} from "./guards";
import * as presence from "./presence";
import { registerBoardHandlers } from "./board.handlers";
import { registerCallHandlers, dropFromCalls } from "./call.handlers";

export interface SocketState extends SocketIdentity {
  name: string;
  email: string;
  conversations: Set<string>;
  boards: Set<string>;
  callRoomId: string | null;
}

declare module "socket.io" {
  interface Socket {
    state: SocketState;
  }
}

let io: Server | null = null;

export function getRealtime(): Server | null {
  return io;
}

export function createRealtime(server: HttpServer, app: JwtCapable): Server {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed"), false);
      },
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1_000_000,
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!raw) return next(new Error("Authentication required"));

      const claims = app.jwt.verify<{
        sub: string;
        name: string;
        email: string;
        activeOrgId?: string;
      }>(raw);

      if (!claims?.sub) return next(new Error("Invalid session token"));

      socket.state = {
        userId: claims.sub,
        name: claims.name ?? "Member",
        email: claims.email ?? "",
        orgId: null,
        role: null,
        conversations: new Set(),
        boards: new Set(),
        callRoomId: null,
      };

      if (claims.activeOrgId) {
        const role = await resolveMembership(claims.sub, claims.activeOrgId);
        if (role) {
          socket.state.orgId = claims.activeOrgId;
          socket.state.role = role;
        }
      }

      return next();
    } catch {
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const state = socket.state;

    void socket.join(rooms.user(state.userId));

    if (state.orgId) {
      scopeToOrg(socket, state.orgId, state.role as Role);
    }

    socket.emit(SOCKET_EVENTS.READY, {
      userId: state.userId,
      orgId: state.orgId,
      role: state.role,
    });

    socket.on(SOCKET_EVENTS.ORG_SWITCH, async (payload: { orgId?: string } = {}) => {
      const orgId = payload?.orgId;
      if (!orgId) return;

      const role = await resolveMembership(state.userId, orgId);
      if (!role) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.ORG_SWITCH,
          message: "You do not have access to that organization",
        });
        return;
      }

      await unscopeFromOrg(socket);
      scopeToOrg(socket, orgId, role);

      socket.emit(SOCKET_EVENTS.ORG_SWITCHED, { orgId, role });
      socket.emit(SOCKET_EVENTS.PRESENCE_SNAPSHOT, {
        orgId,
        members: presence.snapshot(orgId),
      });
    });

    socket.on(
      SOCKET_EVENTS.CONVERSATION_SUBSCRIBE,
      async (payload: { conversationId?: string } = {}) => {
        const conversationId = payload?.conversationId;
        if (!conversationId || state.conversations.has(conversationId)) return;

        if (!(await canAccessConversation(state, conversationId))) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: SOCKET_EVENTS.CONVERSATION_SUBSCRIBE,
            message: "You do not have access to that conversation",
          });
          return;
        }

        state.conversations.add(conversationId);
        void socket.join(rooms.conversation(conversationId));
      },
    );

    socket.on(
      SOCKET_EVENTS.CONVERSATION_UNSUBSCRIBE,
      (payload: { conversationId?: string } = {}) => {
        const conversationId = payload?.conversationId;
        if (!conversationId) return;
        state.conversations.delete(conversationId);
        void socket.leave(rooms.conversation(conversationId));
      },
    );

    const emitTyping = (conversationId: string, typing: boolean) => {
      if (!state.conversations.has(conversationId)) return;

      socket.to(rooms.conversation(conversationId)).emit(SOCKET_EVENTS.TYPING_UPDATE, {
        conversationId,
        userId: state.userId,
        name: state.name,
        typing,
      });
    };

    socket.on(SOCKET_EVENTS.TYPING_START, (payload: { conversationId?: string } = {}) => {
      if (payload?.conversationId) emitTyping(payload.conversationId, true);
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (payload: { conversationId?: string } = {}) => {
      if (payload?.conversationId) emitTyping(payload.conversationId, false);
    });

    socket.on(SOCKET_EVENTS.PRESENCE_SUBSCRIBE, () => {
      if (!state.orgId) return;
      socket.emit(SOCKET_EVENTS.PRESENCE_SNAPSHOT, {
        orgId: state.orgId,
        members: presence.snapshot(state.orgId),
      });
    });

    socket.on(
      SOCKET_EVENTS.PRESENCE_SET_STATUS,
      (payload: { status?: PresenceStatus } = {}) => {
        const status = payload?.status;
        if (!state.orgId || !status) return;
        if (!PRESENCE_STATUSES.includes(status)) return;
        presence.setStatus(io!, { orgId: state.orgId, userId: state.userId, status });
      },
    );

    registerBoardHandlers(io!, socket);
    registerCallHandlers(io!, socket);

    socket.on("disconnecting", () => {
      dropFromCalls(io!, socket);
    });

    socket.on("disconnect", () => {
      void unscopeFromOrg(socket);
    });
  });

  logger.info("realtime gateway ready");
  return io;
}

function scopeToOrg(socket: Socket, orgId: string, role: Role) {
  socket.state.orgId = orgId;
  socket.state.role = role;
  void socket.join(rooms.org(orgId));

  presence.join(io!, {
    orgId,
    userId: socket.state.userId,
    socketId: socket.id,
    name: socket.state.name,
  });
}

async function unscopeFromOrg(socket: Socket) {
  const state = socket.state;
  if (!state.orgId) return;

  for (const conversationId of state.conversations) {
    void socket.leave(rooms.conversation(conversationId));
  }
  state.conversations.clear();

  for (const boardId of state.boards) {
    void socket.leave(rooms.board(boardId));
  }
  state.boards.clear();

  await presence.leave(io!, {
    orgId: state.orgId,
    userId: state.userId,
    socketId: socket.id,
  });

  void socket.leave(rooms.org(state.orgId));
  state.orgId = null;
  state.role = null;
}

export { canAccessBoard, canAccessCall, canAccessConversation, hasPermission, presence };
