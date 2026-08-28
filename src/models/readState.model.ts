import { Schema, model, type Document, type Types } from "mongoose";

export interface ReadStateDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  conversationId: Types.ObjectId;
  lastReadMessageId?: Types.ObjectId;
  lastReadAt: Date;
  mentionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const readStateSchema = new Schema<ReadStateDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    lastReadMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    lastReadAt: { type: Date, default: Date.now },
    mentionCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "readstates" },
);

readStateSchema.index({ userId: 1, conversationId: 1 }, { unique: true });
readStateSchema.index({ userId: 1, orgId: 1 });

export const ReadState = model<ReadStateDocument>("ReadState", readStateSchema);
