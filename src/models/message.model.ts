import { Schema, model, type Document, type Types } from "mongoose";

export const MESSAGE_TYPES = ["text", "image", "file", "system"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface Attachment {
  url: string;
  name: string;
  type: string;
  size?: number;
  publicId?: string;
  width?: number;
  height?: number;
}

export interface Reaction {
  emoji: string;
  userIds: Types.ObjectId[];
}

export interface MessageDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  content: string;
  type: MessageType;
  attachments: Attachment[];
  reactions: Reaction[];
  replyTo?: Types.ObjectId;
  mentions: Types.ObjectId[];
  editedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<Attachment>(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number },
    publicId: { type: String },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false },
);

const reactionSchema = new Schema<Reaction>(
  {
    emoji: { type: String, required: true },
    userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, default: "", maxlength: 4000 },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    attachments: { type: [attachmentSchema], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: "Message" },
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true, collection: "messages" },
);

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ orgId: 1, content: "text" });
messageSchema.index({ orgId: 1, mentions: 1, _id: -1 });

export const Message = model<MessageDocument>("Message", messageSchema);
