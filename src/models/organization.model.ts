import { Schema, model, type Document, type Types } from "mongoose";

export interface OrganizationDocument extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  accent?: string;
  ownerId: Types.ObjectId;
  memberCount: number;
  adminEmails?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<OrganizationDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, maxlength: 280 },
    avatarUrl: { type: String },
    accent: { type: String, default: "#5B7CFA" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberCount: { type: Number, default: 1 },
    adminEmails: { type: [String], default: undefined },
  },
  { timestamps: true, collection: "tenants" },
);

organizationSchema.index({ name: "text" });

organizationSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } },
);

export const Organization = model<OrganizationDocument>(
  "Organization",
  organizationSchema,
);
