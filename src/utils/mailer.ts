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

function siteUrl(): string {
  return (process.env.FRONTEND_URL || 'https://clerkdiary.com').replace(
    /\/$/,
    ''
  );
}

function supportEmail(): string {
  return (
    process.env.MAIL_SUPPORT?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'aliwheed@gmail.com'
  );
}

function fromAddress(): string {
  const smtpUser = process.env.SMTP_USER?.trim() || '';
  // From must match the authenticated SMTP mailbox (Gmail rejects mismatches).
  return (
    process.env.MAIL_FROM?.trim() || `Court Files <${smtpUser}>`
  );
}

function mailHeaders(extra?: Record<string, string>): Record<string, string> {
  const support = supportEmail();
  return {
    'X-Mailer': 'Court Files',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
    'List-Unsubscribe': `<mailto:${support}?subject=unsubscribe>`,
    ...extra,
  };
}

function wrapHtmlEmail(input: {
  title: string;
  preheader: string;
  bodyHtml: string;
}): string {
  const site = siteUrl();
  const support = supportEmail();
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3faf6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14261d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${escapeHtml(input.preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3faf6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #d5e6dc;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f6b45;padding:20px 24px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Court Files</p>
              <p style="margin:4px 0 0;font-size:12px;color:#d9eee4;">Case &amp; hearing ledger · ${escapeHtml(site.replace(/^https?:\/\//, ''))}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#4d6358;">
                Need help? Contact us at
                <a href="mailto:${escapeHtml(support)}" style="color:#0f6b45;text-decoration:none;">${escapeHtml(support)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fcfa;border-top:1px solid #d5e6dc;padding:16px 24px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7f74;">
                © ${year} Court Files ·
                <a href="${escapeHtml(site)}" style="color:#0f6b45;text-decoration:none;">${escapeHtml(site)}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;line-height:1.5;color:#8a9a92;">
                This message was sent because you use Court Files. If you did not expect it, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function wrapTextEmail(input: {
  greeting: string;
  lines: string[];
}): string {
  const site = siteUrl();
  const support = supportEmail();
  const year = new Date().getFullYear();
  return [
    input.greeting,
    '',
    ...input.lines,
    '',
    '—',
    'Court Files',
    site,
    `Support: ${support}`,
    `© ${year} Court Files`,
  ].join('\n');
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  ttlMinutes: number;
}): Promise<void> {
  const ttl = String(input.ttlMinutes);
  const name = input.name || 'Advocate';
  const subject = 'Court Files password reset request';
  const preheader = `Reset link expires in ${ttl} minutes.`;

  const text = wrapTextEmail({
    greeting: `Hello ${name},`,
    lines: [
      'We received a request to reset your Court Files password.',
      `This link expires in ${ttl} minutes:`,
      '',
      input.resetUrl,
      '',
      'If you did not ask for this, you can ignore this email. Your password will not change.',
    ],
  });

  const html = wrapHtmlEmail({
    title: subject,
    preheader,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334940;">
        We received a request to reset your Court Files password. This link expires in <strong>${escapeHtml(ttl)} minutes</strong>.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(input.resetUrl)}"
           style="display:inline-block;background-color:#0f6b45;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
          Reset password
        </a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7f74;word-break:break-all;">
        ${escapeHtml(input.resetUrl)}
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4d6358;">
        If you did not ask for this, you can ignore this email. Your password will not change.
      </p>
    `,
  });

  await transporter().sendMail({
    from: fromAddress(),
    to: input.to,
    replyTo: supportEmail(),
    subject,
    text,
    html,
    headers: mailHeaders(),
  });
}

export async function sendEmailVerification(input: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const name = input.name || 'Advocate';
  const subject = 'Confirm your Court Files email address';
  const preheader = 'Open this email to confirm your Court Files account.';

  const text = wrapTextEmail({
    greeting: `Hello ${name},`,
    lines: [
      'Welcome to Court Files. Please confirm your email address by opening the link below:',
      '',
      input.verifyUrl,
      '',
      'If you did not create this account, you can ignore this email.',
    ],
  });

  const html = wrapHtmlEmail({
    title: subject,
    preheader,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334940;">
        Welcome to Court Files. Please confirm your email address to finish setting up your account.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(input.verifyUrl)}"
           style="display:inline-block;background-color:#0f6b45;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
          Confirm email
        </a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7f74;word-break:break-all;">
        ${escapeHtml(input.verifyUrl)}
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4d6358;">
        If you did not create this account, you can ignore this email.
      </p>
    `,
  });

  await transporter().sendMail({
    from: fromAddress(),
    to: input.to,
    replyTo: supportEmail(),
    subject,
    text,
    html,
    headers: mailHeaders(),
  });
}

/** Registration OTP — proves the user owns the email address. */
export async function sendRegistrationOtpEmail(input: {
  to: string;
  name: string;
  otp: string;
  ttlMinutes?: number;
}): Promise<void> {
  const name = input.name || 'Advocate';
  const ttl = String(input.ttlMinutes ?? 10);
  const subject = 'Your Court Files email verification code';
  const preheader = `Your verification code is ${input.otp}. It expires in ${ttl} minutes.`;

  const text = wrapTextEmail({
    greeting: `Hello ${name},`,
    lines: [
      'Thank you for registering with Court Files.',
      'Use this one-time verification code to confirm your email address:',
      '',
      input.otp,
      '',
      `This code expires in ${ttl} minutes.`,
      'Do not share this code with anyone.',
      '',
      'If you did not create a Court Files account, you can ignore this email.',
    ],
  });

  const html = wrapHtmlEmail({
    title: subject,
    preheader,
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334940;">
        Thank you for registering with Court Files. Use this one-time code to confirm your email address and finish registration.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
        <tr>
          <td style="background-color:#f3faf6;border:1px solid #d5e6dc;border-radius:10px;padding:16px 28px;">
            <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.28em;font-family:Consolas,'Courier New',monospace;color:#0f6b45;text-align:center;">
              ${escapeHtml(input.otp)}
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#334940;">
        This code expires in <strong>${escapeHtml(ttl)} minutes</strong>. Do not share it with anyone.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#4d6358;">
        If you did not create a Court Files account, you can ignore this email.
      </p>
    `,
  });

  await transporter().sendMail({
    from: fromAddress(),
    to: input.to,
    replyTo: supportEmail(),
    subject,
    text,
    html,
    headers: mailHeaders({
      'X-Entity-Type': 'transactional',
    }),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
