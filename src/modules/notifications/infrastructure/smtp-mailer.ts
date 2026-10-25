import nodemailer from "nodemailer";
import { env } from "@/shared/config/env";
import type { Mailer } from "../application/ports";

/** nodemailer over SMTP, configured from env. Without SMTP_HOST it reports `configured: false`. */
export function smtpMailer(): Mailer {
  const e = env();
  if (!e.SMTP_HOST) return { configured: false, send: async () => undefined };
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS ?? e.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return {
    configured: true,
    async send(m, files = []) {
      await transport.sendMail({
        from: e.SMTP_FROM,
        to: m.to,
        ...(m.cc ? { cc: m.cc } : {}),
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: files.map((f) => ({ filename: f.filename, content: Buffer.from(f.content), contentType: f.contentType })),
      });
    },
  };
}
