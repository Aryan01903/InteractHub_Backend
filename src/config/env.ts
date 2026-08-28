import "dotenv/config";
import { z } from "zod";

const csv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default("0.0.0.0"),

  DB_URL: z.string().min(1, "DB_URL is required"),

  SECRET: z.string().min(32, "SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("7d"),

  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional().transform((v) => (v ? csv(v) : [])),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  BREVO_MAIL: z.string().optional(),
  BREVO_SMTP_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default("InteractHub"),
  MAIL_FROM: z.string().default("InteractHub <onboarding@resend.dev>"),

  CLOUDINARY_NAME: z.string().optional(),
  CLOUDINARY_KEY: z.string().optional(),
  CLOUDINARY_SECRET: z.string().optional(),

  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  // eslint-disable-next-line no-console -- the logger does not exist yet.
  console.error(`FATAL: invalid environment configuration\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const adminConsoleEnabled = Boolean(env.ADMIN_PASSWORD);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const mailEnabled = Boolean(
  (env.BREVO_API_KEY && env.BREVO_SENDER) ||
    env.RESEND_API_KEY ||
    (env.SMTP_HOST && env.MAIL_USER && env.MAIL_PASS) ||
    (env.BREVO_MAIL && env.BREVO_SMTP_KEY),
);

export const cloudinaryEnabled = Boolean(
  env.CLOUDINARY_NAME && env.CLOUDINARY_KEY && env.CLOUDINARY_SECRET,
);

export const allowedOrigins = Array.from(
  new Set([
    env.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://interacthub.vercel.app",
    "https://boardstack-pi.vercel.app",
    ...env.CORS_ORIGINS,
  ]),
);
