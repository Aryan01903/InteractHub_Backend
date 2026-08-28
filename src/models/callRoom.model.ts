import { Schema, model, type Document, type Types } from "mongoose";

export interface CallRoomDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  roomId: string;
  title: string;
  orgId: Types.ObjectId;
  createdBy: Types.ObjectId;
  conversationId?: Types.ObjectId;
  scheduledAt?: Date | null;
  startedAt?: Date;
  endedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const callRoomSchema = new Schema<CallRoomDocument>(
  {
    roomId: { type: String, required: true, unique: true },
    title: { type: String, default: "Team Meeting", trim: true, maxlength: 80 },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date },
    endedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "videorooms" },
);

callRoomSchema.index({ orgId: 1, expiresAt: -1 });
callRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CallRoom = model<CallRoomDocument>("CallRoom", callRoomSchema);
