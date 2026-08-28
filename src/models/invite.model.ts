import { Schema, model, type Document, type Types } from "mongoose";
import { ROLES, type Role } from "../config/rbac";

export interface InviteDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  email: string;
  orgId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  role: Role;
  tokenHash: string;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<InviteDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, "Please enter a valid email address"],
    },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: {
      type: String,
      enum: ROLES.filter((r) => r !== "owner"),
      default: "member",
    },
    tokenHash: { type: String, required: true, unique: true },
    usedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "invites" },
);

inviteSchema.index({ orgId: 1, email: 1 });
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = model<InviteDocument>("Invite", inviteSchema);
