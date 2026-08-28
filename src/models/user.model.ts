import { Schema, model, type Document, type Types } from "mongoose";
import { PRESENCE_STATUSES, type PresenceStatus } from "../config/events";

export interface UserDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  avatarUrl?: string;
  isVerified: boolean;

  otpHash?: string;
  otpExpires?: Date;
  otpPurpose?: "register" | "login" | "forgotpassword";
  otpAttempts: number;

  defaultOrgId?: Types.ObjectId;

  presenceStatus: PresenceStatus;
  lastSeenAt?: Date;

  tenantId?: Types.ObjectId;
  tenantName?: string;
  role?: string;

  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, "Please enter a valid email address"],
    },
    password: { type: String, required: true, select: false },
    avatarUrl: { type: String },
    isVerified: { type: Boolean, default: false },

    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpPurpose: {
      type: String,
      enum: ["register", "login", "forgotpassword"],
      select: false,
    },
    otpAttempts: { type: Number, default: 0, select: false },

    defaultOrgId: { type: Schema.Types.ObjectId, ref: "Organization" },

    presenceStatus: {
      type: String,
      enum: PRESENCE_STATUSES,
      default: "offline",
    },
    lastSeenAt: { type: Date },

    tenantId: { type: Schema.Types.ObjectId, ref: "Organization" },
    tenantName: { type: String },
    role: { type: String },
  },
  { timestamps: true, collection: "users" },
);

userSchema.index({ name: "text", email: "text" });

export const User = model<UserDocument>("User", userSchema);
