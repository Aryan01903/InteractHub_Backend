import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(
    /[!@#$%^&*()_\-+=<>?{}[\]~]/,
    "Password must contain a special character",
  );

export const emailSchema = z
  .string()
  .email("Enter a valid email address")
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const otpPurposeSchema = z.enum(["register", "login", "forgotpassword"]);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(60).optional(),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  purpose: otpPurposeSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const requestOtpSchema = z.object({
  email: emailSchema,
  purpose: otpPurposeSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, "Invalid reset link"),
  password: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(16, "Invalid invitation link"),
  name: z.string().trim().min(2).max(80).optional(),
  password: passwordSchema.optional(),
});

export const inviteLookupSchema = z.object({
  token: z.string().min(16),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z.string().url().max(500).nullish(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
