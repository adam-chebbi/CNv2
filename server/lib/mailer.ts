import nodemailer from 'nodemailer';

// Transactional email of the customer pages only (password recovery) — never marketing campaigns,
// which are out of scope (cahier des charges §19.3). Configured by environment variables, never
// committed: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME. Without them the app
// still runs and logs the message instead (development).

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

const createMailerFromEnv = (env: NodeJS.ProcessEnv = process.env): Mailer => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      enabled: false,
      send: async (m) => {
        // eslint-disable-next-line no-console
        console.warn(`[mailer] SMTP non configuré — email non envoyé à ${m.to} (« ${m.subject} »)`);
        // eslint-disable-next-line no-console
        if (env.NODE_ENV !== 'production' && !env.DB_PATH) console.warn(m.text);
      },
    };
  }
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, '') } });
  const from = { name: env.SMTP_FROM_NAME || 'Café Noir', address: SMTP_USER };
  return {
    enabled: true,
    send: async (m) => {
      await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    },
  };
};

let mailer: Mailer = createMailerFromEnv();

export const getMailer = (): Mailer => mailer;
// Tests capture outgoing mail instead of sending it.
export const setMailer = (m: Mailer): void => {
  mailer = m;
};
