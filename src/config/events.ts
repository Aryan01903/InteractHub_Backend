export const SOCKET_EVENTS = {
  READY: "connection:ready",
  ERROR: "connection:error",

  ORG_SWITCH: "org:switch",
  ORG_SWITCHED: "org:switched",
  ORG_MEMBER_ADDED: "organization:member-added",
  ORG_MEMBER_REMOVED: "organization:member-removed",
  ORG_MEMBER_UPDATED: "organization:member-updated",

  CONVERSATION_SUBSCRIBE: "conversation:subscribe",
  CONVERSATION_UNSUBSCRIBE: "conversation:unsubscribe",
  CONVERSATION_CREATED: "conversation:created",
  CONVERSATION_UPDATED: "conversation:updated",
  CONVERSATION_DELETED: "conversation:deleted",
  CONVERSATION_READ: "conversation:read",

  MESSAGE_NEW: "message:new",
  MESSAGE_UPDATE: "message:update",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_REACTION: "message:reaction",

  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  TYPING_UPDATE: "typing:update",

  PRESENCE_SUBSCRIBE: "presence:subscribe",
  PRESENCE_UPDATE: "presence:update",
  PRESENCE_SNAPSHOT: "presence:snapshot",
  PRESENCE_SET_STATUS: "presence:set-status",

  BOARD_JOIN: "whiteboard:join",
  BOARD_LEAVE: "whiteboard:leave",
  BOARD_STATE: "whiteboard:state",
  BOARD_UPDATE: "whiteboard:update",
  BOARD_CLEAR: "whiteboard:clear",
  BOARD_CURSOR: "whiteboard:cursor",
  BOARD_PRESENCE: "whiteboard:presence",

  CALL_JOIN: "call:join",
  CALL_LEAVE: "call:leave",
  CALL_PEERS: "call:peers",
  CALL_PEER_JOINED: "call:peer-joined",
  CALL_PEER_LEFT: "call:peer-left",
  CALL_OFFER: "call:offer",
  CALL_ANSWER: "call:answer",
  CALL_ICE_CANDIDATE: "call:ice-candidate",
  CALL_MEDIA_STATE: "call:media-state",
  CALL_SPEAKING: "call:speaking",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export const rooms = {
  org: (orgId: string) => `org:${orgId}`,
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  board: (boardId: string) => `board:${boardId}`,
  call: (roomId: string) => `call:${roomId}`,
} as const;

export const PRESENCE_STATUSES = ["online", "idle", "dnd", "offline"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];
