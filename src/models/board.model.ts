import { Schema, model, type Document, type Types } from "mongoose";

export interface BoardVersionDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  orgId: Types.ObjectId;
  data: unknown;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface WhiteboardDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  name: string;
  orgId: Types.ObjectId;
  createdBy: Types.ObjectId;
  data: unknown;
  thumbnail?: string;
  lastEditedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const boardVersionSchema = new Schema<BoardVersionDocument>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: "Whiteboard", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    data: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "boardversions" },
);

boardVersionSchema.index({ boardId: 1, _id: -1 });

const whiteboardSchema = new Schema<WhiteboardDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    data: { type: Schema.Types.Mixed },
    thumbnail: { type: String },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "whiteboards" },
);

whiteboardSchema.index({ orgId: 1, updatedAt: -1 });
whiteboardSchema.index({ orgId: 1, name: "text" });

export const Whiteboard = model<WhiteboardDocument>("Whiteboard", whiteboardSchema);
export const BoardVersion = model<BoardVersionDocument>(
  "BoardVersion",
  boardVersionSchema,
);
