import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

let cached: Transporter | null = null;

function transport(): Transporter | null {
  if (cached) return cached;

  const host = env.SMTP_HOST ?? "smtp-relay.brevo.com";
  const port = env.SMTP_PORT ?? 587;
  const user = env.BREVO_MAIL ?? env.MAIL_USER;
  const pass = env.BREVO_SMTP_KEY ?? env.MAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cached;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(input: MailInput): Promise<boolean> {
  const mailer = transport();

  if (!mailer) {
    logger.warn(
      { to: input.to, subject: input.subject },
      "mail not configured - email was not sent",
    );
    return false;
  }

  try {
    await mailer.sendMail({
      from: env.MAIL_FROM,
      to: Array.isArray(input.to) ? input.to.join(",") : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripTags(input.html),
    });
    return true;
  } catch (error) {
    logger.error(
      { err: error, to: input.to, subject: input.subject },
      "failed to send email",
    );
    return false;
  }
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const shell = (heading: string, body: string) => `
<div style="margin:0;padding:32px 16px;background:#0B0C10;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#14161C;border:1px solid #232733;border-radius:16px;padding:32px;">
    <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#7C8398;margin-bottom:20px;">InteractHub</div>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#EDEFF5;font-weight:600;">${heading}</h1>
    ${body}
    <p style="margin:28px 0 0;font-size:12px;color:#5C6379;line-height:1.6;">
      If you were not expecting this email you can safely ignore it.
    </p>
  </div>
</div>`;

const button = (href: string, label: string) => `
<a href="${href}" style="display:inline-block;margin:20px 0;padding:12px 22px;background:#5B7CFA;color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">${label}</a>`;

const paragraph = (text: string) =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#A8AFC2;">${text}</p>`;

export function sendOtpEmail(to: string, otp: string, purpose: string) {
  const reason =
    purpose === "register"
      ? "confirm your InteractHub account"
      : purpose === "login"
        ? "sign in to InteractHub"
        : "reset your InteractHub password";

  return sendMail({
    to,
    subject: `${otp} is your InteractHub code`,
    html: shell(
      "Your verification code",
      `${paragraph(`Use this code to ${reason}. It expires in 10 minutes.`)}
       <div style="margin:24px 0;padding:18px;background:#0B0C10;border:1px solid #232733;border-radius:12px;text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;color:#EDEFF5;font-family:ui-monospace,SFMono-Regular,monospace;">${esc(otp)}</div>
       ${paragraph("Never share this code with anyone.")}`,
    ),
  });
}

export function sendInviteEmail(params: {
  to: string;
  token: string;
  orgName: string;
  inviterName: string;
  role: string;
}) {
  const link = `${env.FRONTEND_URL}/accept-invite?token=${encodeURIComponent(params.token)}`;

  return sendMail({
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.orgName} on InteractHub`,
    html: shell(
      `Join ${esc(params.orgName)}`,
      `${paragraph(`<strong style="color:#EDEFF5;">${esc(params.inviterName)}</strong> invited you to collaborate in <strong style="color:#EDEFF5;">${esc(params.orgName)}</strong> as a ${esc(params.role)}.`)}
       ${button(link, "Accept invitation")}
       ${paragraph("This invitation expires in 24 hours.")}`,
    ),
  });
}

export function sendOrgCreatedEmail(params: {
  to: string;
  orgName: string;
  orgId: string;
}) {
  return sendMail({
    to: params.to,
    subject: `${params.orgName} is ready on InteractHub`,
    html: shell(
      `${esc(params.orgName)} is live`,
      `${paragraph("Your organization has been created. You are its owner, so you can invite teammates, open channels, start meetings and manage roles.")}
       ${button(`${env.FRONTEND_URL}/o/${params.orgId}`, "Open your workspace")}`,
    ),
  });
}

export function sendPasswordResetEmail(to: string, token: string) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

  return sendMail({
    to,
    subject: "Reset your InteractHub password",
    html: shell(
      "Reset your password",
      `${paragraph("Choose a new password using the link below. It expires in 30 minutes and can be used once.")}
       ${button(link, "Set a new password")}`,
    ),
  });
}

export function sendCallInviteEmail(params: {
  to: string[];
  roomId: string;
  title: string;
  hostName: string;
  orgName: string;
  startsAt: Date;
}) {
  const link = `${env.FRONTEND_URL}/call/${params.roomId}`;
  const when = params.startsAt.toUTCString();

  return sendMail({
    to: params.to,
    subject: `${params.hostName} invited you to "${params.title}"`,
    html: shell(
      esc(params.title),
      `${paragraph(`<strong style="color:#EDEFF5;">${esc(params.hostName)}</strong> is hosting a meeting in <strong style="color:#EDEFF5;">${esc(params.orgName)}</strong>.`)}
       ${paragraph(`Starts: ${esc(when)}`)}
       ${button(link, "Join the meeting")}`,
    ),
  });
}
