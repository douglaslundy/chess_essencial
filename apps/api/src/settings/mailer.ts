import nodemailer from 'nodemailer';

export interface SmtpTransportConfig {
  fromAddress: string;
  fromName: string;
  host: string;
  password: string | null;
  port: number;
  secure: boolean;
  username: string | null;
}

export interface OutgoingMail {
  subject: string;
  text: string;
  to: string;
}

/**
 * Sends one email over real SMTP, including AUTH when credentials are
 * configured (the previous hand-rolled SMTP client never authenticated,
 * which silently prevented delivery through any real provider).
 */
export async function sendMail(smtp: SmtpTransportConfig, message: OutgoingMail): Promise<void> {
  const transporter = nodemailer.createTransport({
    auth: smtp.username ? { pass: smtp.password ?? undefined, user: smtp.username } : undefined,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
  });
  try {
    await transporter.sendMail({
      from: `${smtp.fromName} <${smtp.fromAddress}>`,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
  } finally {
    transporter.close();
  }
}
