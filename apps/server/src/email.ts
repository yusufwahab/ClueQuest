import { brand } from '@cluequest/config';
import type { Env } from './env';

export interface Mail { to: string; subject: string; html: string; text: string }
export type SendResult = { status: 'sent' | 'logged_dev' | 'failed'; error?: string };

/**
 * Brevo transactional email. In EMAIL_MODE=log (development) nothing is sent: the message is kept in `outbox`
 * and reported as `logged_dev`, so it can never be mistaken for a delivered email.
 */
export class Mailer {
  public outbox: Mail[] = [];
  constructor(private env: Env) {}

  async send(mail: Mail): Promise<SendResult> {
    if (this.env.EMAIL_MODE === 'log') {
      this.outbox.push(mail);
      if (this.env.NODE_ENV !== 'test') console.log(`[email:not-sent] to=${mail.to} subject="${mail.subject}"`);
      return { status: 'logged_dev' };
    }
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: this.env.BREVO_SENDER_EMAIL, name: this.env.BREVO_SENDER_NAME },
          to: [{ email: mail.to }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
        }),
      });
      if (!res.ok) return { status: 'failed', error: `Brevo responded ${res.status}` };
      return { status: 'sent' };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function invitationEmail(args: { to: string; name: string; quizTitle: string; url: string; opensAt: string | null; closesAt: string | null }): Mail {
  const window = args.closesAt ? `Available until ${args.closesAt}.` : 'Open until your host closes it.';
  const text = [
    `Hello ${args.name},`,
    '',
    `You have been invited to take "${args.quizTitle}" on ${brand.name}.`,
    ...(args.opensAt ? [`Opens: ${args.opensAt}`] : []),
    window,
    '',
    `Your personal link (do not share it): ${args.url}`,
    '',
    brand.email.footer,
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
<h2>You are invited to an exam</h2><p>Hello ${esc(args.name)},</p>
<p>You have been invited to take <strong>${esc(args.quizTitle)}</strong>.</p><p>${esc(window)}</p>
<p><a href="${esc(args.url)}">Open your personal exam link</a></p>
<p style="color:#666;font-size:12px">This link is personal to you. ${esc(brand.email.footer)}</p></div>`;
  return { to: args.to, subject: `${brand.name}: invitation to ${args.quizTitle}`, html, text };
}
