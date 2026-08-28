import nodemailer, { type Transporter } from "nodemailer";
import { env, isTest } from "../config/env";
import { logger } from "./logger";

const SEND_TIMEOUT_MS = 8_000;

let cached: Transporter | null = null;

function credentials() {
  if (env.BREVO_MAIL && env.BREVO_SMTP_KEY) {
    return {
      host: "smtp-relay.brevo.com",
      port: 587,
      user: env.BREVO_MAIL,
      pass: env.BREVO_SMTP_KEY,
    };
  }

  if (env.SMTP_HOST && env.MAIL_USER && env.MAIL_PASS) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      user: env.MAIL_USER,
      pass: env.MAIL_PASS,
    };
  }

  return null;
}

function transport(): Transporter | null {
  if (cached) return cached;

  const config = credentials();
  if (!config) return null;

  const { host, port, user, pass } = config;

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  return cached;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

const recipients = (to: string | string[]) => (Array.isArray(to) ? to : [to]);

async function sendViaBrevoApi(input: MailInput): Promise<boolean> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER) return false;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER, name: env.BREVO_SENDER_NAME },
      to: recipients(input.to).map((email) => ({ email })),
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text ?? stripTags(input.html),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`brevo ${response.status}: ${detail.slice(0, 200)}`);
  }

  return true;
}

async function sendViaSmtp(input: MailInput): Promise<void> {
  const mailer = transport();
  if (!mailer) throw new Error("smtp is not configured");

  await mailer.sendMail({
    from: env.BREVO_SENDER
      ? `${env.BREVO_SENDER_NAME} <${env.BREVO_SENDER}>`
      : env.MAIL_FROM,
    to: recipients(input.to).join(","),
    subject: input.subject,
    html: input.html,
    text: input.text ?? stripTags(input.html),
  });
}

export async function sendMail(input: MailInput): Promise<boolean> {
  if (isTest) {
    logger.debug({ to: input.to, subject: input.subject }, "email suppressed in tests");
    return true;
  }

  const started = Date.now();
  const canUseApi = Boolean(env.BREVO_API_KEY && env.BREVO_SENDER);

  if (credentials()) {
    try {
      await sendViaSmtp(input);
      logger.info(
        { to: input.to, subject: input.subject, ms: Date.now() - started, via: "smtp" },
        "email sent",
      );
      return true;
    } catch (error) {
      cached = null;
      logger[canUseApi ? "warn" : "error"](
        { err: error, to: input.to, subject: input.subject },
        canUseApi
          ? "smtp send failed - falling back to the brevo api"
          : "failed to send email",
      );
      if (!canUseApi) return false;
    }
  }

  if (!canUseApi) {
    logger.warn(
      { to: input.to, subject: input.subject },
      "mail not configured - email was not sent",
    );
    return false;
  }

  try {
    await sendViaBrevoApi(input);
    logger.info(
      { to: input.to, subject: input.subject, ms: Date.now() - started, via: "brevo-api" },
      "email sent",
    );
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
