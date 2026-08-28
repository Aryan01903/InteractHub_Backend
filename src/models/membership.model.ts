import { Schema, model, type Document, type Types } from "mongoose";
import { ROLES, type Role } from "../config/rbac";

export const MEMBERSHIP_STATUSES = ["active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface MembershipDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  role: Role;
  status: MembershipStatus;
  joinedAt: Date;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<MembershipDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    role: { type: String, enum: ROLES, default: "member", required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: "active" },
    joinedAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date },
  },
  { timestamps: true, collection: "memberships" },
);

membershipSchema.index({ userId: 1, orgId: 1 }, { unique: true });
membershipSchema.index({ orgId: 1, status: 1, role: 1 });

export const Membership = model<MembershipDocument>(
  "Membership",
  membershipSchema,
);
