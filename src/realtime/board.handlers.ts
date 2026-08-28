import type { Server, Socket } from "socket.io";
import { Types } from "mongoose";
import { SOCKET_EVENTS, rooms } from "../config/events";
import { Whiteboard } from "../models/board.model";
import { canAccessBoard, hasPermission } from "./guards";
import { logger } from "../utils/logger";

const collaborators = new Map<string, Map<string, { userId: string; name: string }>>();

function roster(boardId: string) {
  return [...(collaborators.get(boardId)?.values() ?? [])];
}

function announce(io: Server, boardId: string) {
  io.to(rooms.board(boardId)).emit(SOCKET_EVENTS.BOARD_PRESENCE, {
    boardId,
    collaborators: roster(boardId),
  });
}

export function registerBoardHandlers(io: Server, socket: Socket) {
  const state = socket.state;

  socket.on(SOCKET_EVENTS.BOARD_JOIN, async (payload: { boardId?: string } = {}) => {
    const boardId = payload?.boardId;
    if (!boardId || state.boards.has(boardId)) return;

    if (!(await canAccessBoard(state, boardId))) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        event: SOCKET_EVENTS.BOARD_JOIN,
        message: "You do not have access to that board",
      });
      return;
    }

    state.boards.add(boardId);
    await socket.join(rooms.board(boardId));

    let map = collaborators.get(boardId);
    if (!map) {
      map = new Map();
      collaborators.set(boardId, map);
    }
    map.set(socket.id, { userId: state.userId, name: state.name });

    try {
      const board = await Whiteboard.findById(new Types.ObjectId(boardId))
        .select("data name")
        .lean();
      socket.emit(SOCKET_EVENTS.BOARD_STATE, {
        boardId,
        data: board?.data ?? null,
        name: board?.name ?? null,
      });
    } catch (error) {
      logger.error({ err: error, boardId }, "failed to load board state");
    }

    announce(io, boardId);
  });

  socket.on(SOCKET_EVENTS.BOARD_LEAVE, (payload: { boardId?: string } = {}) => {
    const boardId = payload?.boardId;
    if (!boardId || !state.boards.has(boardId)) return;

    state.boards.delete(boardId);
    void socket.leave(rooms.board(boardId));
    collaborators.get(boardId)?.delete(socket.id);
    announce(io, boardId);
  });

  socket.on(
    SOCKET_EVENTS.BOARD_UPDATE,
    (payload: { boardId?: string; [key: string]: unknown } = {}) => {
      const { boardId, ...segment } = payload;
      if (!boardId || !state.boards.has(boardId)) return;
      if (!hasPermission(state, "board:update")) return;

      socket.to(rooms.board(boardId)).emit(SOCKET_EVENTS.BOARD_UPDATE, {
        ...segment,
        boardId,
        userId: state.userId,
      });
    },
  );

  socket.on(SOCKET_EVENTS.BOARD_CLEAR, (payload: { boardId?: string } = {}) => {
    const boardId = payload?.boardId;
    if (!boardId || !state.boards.has(boardId)) return;
    if (!hasPermission(state, "board:update")) return;

    socket.to(rooms.board(boardId)).emit(SOCKET_EVENTS.BOARD_CLEAR, {
      boardId,
      userId: state.userId,
    });
  });

  socket.on(
    SOCKET_EVENTS.BOARD_CURSOR,
    (payload: { boardId?: string; x?: number; y?: number } = {}) => {
      const { boardId, x, y } = payload;
      if (!boardId || !state.boards.has(boardId)) return;
      if (typeof x !== "number" || typeof y !== "number") return;

      socket.to(rooms.board(boardId)).emit(SOCKET_EVENTS.BOARD_CURSOR, {
        boardId,
        userId: state.userId,
        name: state.name,
        x,
        y,
      });
    },
  );

  socket.on("disconnecting", () => {
    for (const boardId of state.boards) {
      collaborators.get(boardId)?.delete(socket.id);
      io.to(rooms.board(boardId)).emit(SOCKET_EVENTS.BOARD_PRESENCE, {
        boardId,
        collaborators: roster(boardId),
      });
      if (collaborators.get(boardId)?.size === 0) collaborators.delete(boardId);
    }
  });
}
