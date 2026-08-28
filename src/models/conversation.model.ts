import { Schema, model, type Document, type Types } from "mongoose";

export const CONVERSATION_TYPES = ["channel", "group", "dm"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface ConversationDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  type: ConversationType;
  name?: string;
  slug?: string;
  topic?: string;
  isPrivate: boolean;
  createdBy: Types.ObjectId;
  participantIds: Types.ObjectId[];
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageId?: Types.ObjectId;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDocument>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    type: { type: String, enum: CONVERSATION_TYPES, required: true },
    name: { type: String, trim: true, maxlength: 80 },
    slug: { type: String, lowercase: true, trim: true },
    topic: { type: String, maxlength: 280 },
    isPrivate: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    participantIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 140 },
    lastMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    archivedAt: { type: Date },
  },
  { timestamps: true, collection: "conversations" },
);

conversationSchema.index({ orgId: 1, lastMessageAt: -1 });
conversationSchema.index({ orgId: 1, participantIds: 1 });
conversationSchema.index(
  { orgId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } },
);

export const Conversation = model<ConversationDocument>(
  "Conversation",
  conversationSchema,
);
