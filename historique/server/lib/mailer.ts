import nodemailer from 'nodemailer';

// Outgoing email for this app only (password reset). Configured purely by environment variables
// (never committed): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME. Without them the
// app still runs; reset requests are accepted but no email leaves (a warning is logged).

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  enabled: boolean;
  send: (m: MailMessage) => Promise<void>;
}

export const createMailerFromEnv = (env: NodeJS.ProcessEnv = process.env): Mailer => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      enabled: false,
      send: async (m) => {
        // eslint-disable-next-line no-console
        console.warn(`[mailer] SMTP non configuré — email non envoyé à ${m.to} (« ${m.subject} »)`);
        // Development only: print the body so a reset link can still be followed locally.
        // eslint-disable-next-line no-console
        if (env.NODE_ENV !== 'production') console.warn(m.text);
      },
    };
  }
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, '') },
  });
  const from = { name: env.SMTP_FROM_NAME || 'Café Noir — Historique & Comptage', address: SMTP_USER };
  return {
    enabled: true,
    send: async (m) => {
      await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    },
  };
};
