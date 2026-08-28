import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    company: { type: String, trim: true, maxlength: 160 },
    topic: {
      type: String,
      enum: ["sales", "support", "partnership", "other"],
      default: "other",
      index: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["new", "read", "archived"],
      default: "new",
      index: true,
    },
    source: { type: String, trim: true, maxlength: 200 },
    ip: { type: String, trim: true, maxlength: 64 },
  },
  { timestamps: true },
);

contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1, createdAt: -1 });

export type ContactAttrs = InferSchemaType<typeof contactSchema>;
export type ContactDoc = HydratedDocument<ContactAttrs>;

export const Contact = model<ContactAttrs>("Contact", contactSchema);
