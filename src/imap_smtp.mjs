import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { loadAppPassword } from './config.mjs';

function getCredentials() {
  const creds = loadAppPassword();
  if (!creds || !creds.user || !creds.pass) {
    throw new Error('Gmail App Password credentials not configured. Please run "npm run auth" to set up.');
  }
  return creds;
}

function createSmtpTransporter() {
  const { user, pass } = getCredentials();
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
}

function createImapClient() {
  const { user, pass } = getCredentials();
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  });
}

export async function getProfile() {
  const { user } = getCredentials();
  const client = createImapClient();
  await client.connect();
  const mailbox = await client.status('INBOX', { messages: true, unseen: true });
  await client.logout();
  return {
    emailAddress: user,
    messagesTotal: mailbox.messages,
    unseenTotal: mailbox.unseen,
    provider: 'IMAP/SMTP (App Password)'
  };
}

export async function searchMessages({ query = '', maxResults = 10 }) {
  const client = createImapClient();
  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  const results = [];

  try {
    let searchCriteria = { all: true };
    const qLower = query.toLowerCase();

    if (qLower.includes('is:unread') || qLower.includes('unread')) {
      searchCriteria = { seen: false };
    }

    const messages = [];
    // Fetch sequence numbers matching criteria
    for await (const msg of client.fetch(searchCriteria, { envelope: true, uid: true, flags: true })) {
      messages.push(msg);
    }

    // Sort descending by sequence/date
    messages.sort((a, b) => (b.envelope?.date || 0) - (a.envelope?.date || 0));

    const slice = messages.slice(0, maxResults);
    for (const msg of slice) {
      const env = msg.envelope || {};
      const fromAddr = env.from?.[0] ? `${env.from[0].name || ''} <${env.from[0].address}>`.trim() : '';
      const toAddr = env.to?.map((t) => `${t.name || ''} <${t.address}>`.trim()).join(', ') || '';

      results.push({
        id: String(msg.uid),
        threadId: env.messageId || String(msg.uid),
        subject: env.subject || '(No Subject)',
        from: fromAddr,
        to: toAddr,
        date: env.date ? env.date.toISOString() : '',
        snippet: env.subject || '',
        flags: Array.from(msg.flags || [])
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return {
    totalFound: results.length,
    messages: results
  };
}

export async function getMessage({ messageId, format = 'clean' }) {
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  let parsed = null;
  let uid = parseInt(messageId, 10);

  try {
    const download = await client.download(uid, undefined, { uid: true });
    if (download && download.content) {
      parsed = await simpleParser(download.content);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (!parsed) {
    throw new Error(`Message with UID ${messageId} not found.`);
  }

  const result = {
    id: String(messageId),
    threadId: parsed.messageId || String(messageId),
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || '',
    to: parsed.to?.text || '',
    cc: parsed.cc?.text || null,
    bcc: parsed.bcc?.text || null,
    date: parsed.date ? parsed.date.toISOString() : '',
    messageIdHeader: parsed.messageId || null,
    snippet: (parsed.text || '').slice(0, 150).replace(/\s+/g, ' '),
    bodyText: parsed.text || '',
    attachments: (parsed.attachments || []).map((att) => ({
      filename: att.filename || 'attachment',
      mimeType: att.contentType,
      size: att.size
    }))
  };

  if (format === 'full' && parsed.html) {
    result.bodyHtml = parsed.html;
  }

  return result;
}

export async function sendEmail({ to, subject, body, html, cc, bcc, replyTo, inReplyTo }) {
  const { user } = getCredentials();
  const transporter = createSmtpTransporter();

  const mailOptions = {
    from: user,
    to,
    subject,
    text: body,
    html: html || undefined,
    cc: cc || undefined,
    bcc: bcc || undefined,
    replyTo: replyTo || undefined,
    inReplyTo: inReplyTo || undefined
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    messageId: info.messageId,
    accepted: info.accepted,
    response: info.response
  };
}

export async function modifyMessage({ messageId, addLabels = [], removeLabels = [] }) {
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  const uid = parseInt(messageId, 10);

  try {
    if (removeLabels.includes('UNREAD')) {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
    if (addLabels.includes('UNREAD')) {
      await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
    }
    if (addLabels.includes('STARRED')) {
      await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
    }
    if (removeLabels.includes('STARRED')) {
      await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return {
    success: true,
    messageId
  };
}
