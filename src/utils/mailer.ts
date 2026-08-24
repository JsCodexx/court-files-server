import nodemailer from 'nodemailer';

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function transporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  ttlMinutes: number;
}): Promise<void> {
  const from =
    process.env.MAIL_FROM?.trim() ||
    `Court Files <${process.env.SMTP_USER}>`;
  const ttl = String(input.ttlMinutes);

  await transporter().sendMail({
    from,
    to: input.to,
    subject: 'Reset your Court Files password',
    text: [
      `Hello ${input.name},`,
      '',
      'We received a request to reset your Court Files password.',
      `This link expires in ${ttl} minutes:`,
      '',
      input.resetUrl,
      '',
      'If you did not ask for this, you can ignore this email. Your password will not change.',
    ].join('\n'),
    html: `
      <p>Hello ${escapeHtml(input.name)},</p>
      <p>We received a request to reset your Court Files password. This link expires in <strong>${ttl} minutes</strong>.</p>
      <p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>
      <p style="color:#666;font-size:13px;word-break:break-all;">${escapeHtml(input.resetUrl)}</p>
      <p>If you did not ask for this, you can ignore this email. Your password will not change.</p>
    `,
  });
}

export async function sendEmailVerification(input: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const from =
    process.env.MAIL_FROM?.trim() ||
    `Court Files <${process.env.SMTP_USER}>`;

  await transporter().sendMail({
    from,
    to: input.to,
    subject: 'Verify your Court Files email',
    text: [
      `Hello ${input.name},`,
      '',
      'Welcome to Court Files! Please verify your email by clicking the link below:',
      '',
      input.verifyUrl,
      '',
      'If you did not create this account, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Hello ${escapeHtml(input.name)},</p>
      <p>Welcome to Court Files! Please verify your email by clicking the link below:</p>
      <p><a href="${escapeHtml(input.verifyUrl)}">Verify Email</a></p>
      <p style="color:#666;font-size:13px;word-break:break-all;">${escapeHtml(input.verifyUrl)}</p>
      <p>If you did not create this account, you can ignore this email.</p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
