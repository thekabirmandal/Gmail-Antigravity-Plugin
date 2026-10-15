import { google } from 'googleapis';
import { loadOAuthClient, loadOAuthTokens, saveOAuthTokens } from './config.mjs';

export function createGmailClient() {
  const clientInfo = loadOAuthClient();
  const tokens = loadOAuthTokens();

  if (!clientInfo || !tokens) {
    throw new Error('Gmail OAuth credentials not configured. Please run "npm run auth" to set up.');
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientInfo.clientId,
    clientInfo.clientSecret,
    clientInfo.redirectUri
  );

  oAuth2Client.setCredentials(tokens);

  // Auto-refresh token listener
  oAuth2Client.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    saveOAuthTokens(updated);
  });

  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

function getHeader(headers, name) {
  const match = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return match ? match.value : null;
}

function extractBodyAndAttachments(payload) {
  let text = '';
  let html = '';
  const attachments = [];

  function walk(part) {
    if (!part) return;
    const mimeType = part.mimeType || '';
    const body = part.body || {};
    const filename = part.filename || '';

    if (filename && filename.length > 0) {
      attachments.push({
        filename,
        mimeType,
        size: body.size || 0,
        attachmentId: body.attachmentId || null
      });
    }

    if (body.data) {
      // Decode base64url or base64
      const base64 = body.data.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      if (mimeType.includes('text/plain')) {
        text += decoded + '\n';
      } else if (mimeType.includes('text/html')) {
        html += decoded + '\n';
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        walk(subPart);
      }
    }
  }

  walk(payload);
  return { text: text.trim(), html: html.trim(), attachments };
}

function encodeEmailRaw({ to, subject, body, html, cc, bcc, replyTo, inReplyTo, references }) {
  const boundary = `__boundary_${Date.now().toString(16)}__`;
  const headers = [];
  if (to) headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  const encodedSubject = subject ? `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=` : '';
  headers.push(`Subject: ${encodedSubject}`);
  headers.push('MIME-Version: 1.0');

  let rawMessage = '';
  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    rawMessage += headers.join('\r\n') + '\r\n\r\n';
    rawMessage += `--${boundary}\r\n`;
    rawMessage += 'Content-Type: text/plain; charset=UTF-8\r\n';
    rawMessage += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    rawMessage += `${body || ''}\r\n\r\n`;
    rawMessage += `--${boundary}\r\n`;
    rawMessage += 'Content-Type: text/html; charset=UTF-8\r\n';
    rawMessage += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
    rawMessage += `${html}\r\n\r\n`;
    rawMessage += `--${boundary}--`;
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: 7bit');
    rawMessage += headers.join('\r\n') + '\r\n\r\n';
    rawMessage += body || '';
  }

  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getProfile() {
  const gmail = createGmailClient();
  const res = await gmail.users.getProfile({ userId: 'me' });
  return {
    emailAddress: res.data.emailAddress,
    messagesTotal: res.data.messagesTotal,
    threadsTotal: res.data.threadsTotal,
    historyId: res.data.historyId
  };
}

export async function searchMessages({ query, maxResults = 10, includeSpamTrash = false }) {
  const gmail = createGmailClient();
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: Math.min(maxResults, 50),
    includeSpamTrash
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) {
    return {
      totalFound: 0,
      messages: []
    };
  }

  // Fetch summary metadata for each message in parallel
  const detailed = await Promise.all(
    messages.map(async (msg) => {
      try {
        const item = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date']
        });
        const headers = item.data.payload?.headers || [];
        return {
          id: msg.id,
          threadId: msg.threadId,
          subject: getHeader(headers, 'Subject') || '(No Subject)',
          from: getHeader(headers, 'From') || '',
          to: getHeader(headers, 'To') || '',
          date: getHeader(headers, 'Date') || '',
          snippet: item.data.snippet || '',
          labelIds: item.data.labelIds || []
        };
      } catch (err) {
        return { id: msg.id, threadId: msg.threadId, error: err.message };
      }
    })
  );

  return {
    totalFound: detailed.length,
    messages: detailed
  };
}

export async function getMessage({ messageId, format = 'clean' }) {
  const gmail = createGmailClient();
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const headers = res.data.payload?.headers || [];
  const { text, html, attachments } = extractBodyAndAttachments(res.data.payload);

  const result = {
    id: res.data.id,
    threadId: res.data.threadId,
    subject: getHeader(headers, 'Subject') || '(No Subject)',
    from: getHeader(headers, 'From') || '',
    to: getHeader(headers, 'To') || '',
    cc: getHeader(headers, 'Cc') || null,
    bcc: getHeader(headers, 'Bcc') || null,
    date: getHeader(headers, 'Date') || '',
    messageIdHeader: getHeader(headers, 'Message-ID') || null,
    labelIds: res.data.labelIds || [],
    snippet: res.data.snippet || '',
    bodyText: text,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size
    }))
  };

  if (format === 'full' && html) {
    result.bodyHtml = html;
  }

  return result;
}

export async function getThread({ threadId }) {
  const gmail = createGmailClient();
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });

  const messages = (res.data.messages || []).map((msg) => {
    const headers = msg.payload?.headers || [];
    const { text, attachments } = extractBodyAndAttachments(msg.payload);
    return {
      id: msg.id,
      date: getHeader(headers, 'Date') || '',
      from: getHeader(headers, 'From') || '',
      to: getHeader(headers, 'To') || '',
      subject: getHeader(headers, 'Subject') || '',
      snippet: msg.snippet || '',
      bodyText: text,
      attachments: attachments.map((a) => a.filename)
    };
  });

  const firstMsg = messages[0];
  return {
    threadId: res.data.id,
    subject: firstMsg?.subject || '(No Subject)',
    messageCount: messages.length,
    messages
  };
}

export async function sendEmail({ to, subject, body, html, cc, bcc, replyTo, threadId, inReplyTo }) {
  const gmail = createGmailClient();
  const raw = encodeEmailRaw({ to, subject, body, html, cc, bcc, replyTo, inReplyTo, references: inReplyTo });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: threadId || undefined
    }
  });

  return {
    success: true,
    messageId: res.data.id,
    threadId: res.data.threadId,
    labelIds: res.data.labelIds
  };
}

export async function createDraft({ to, subject, body, html, cc, bcc, threadId }) {
  const gmail = createGmailClient();
  const raw = encodeEmailRaw({ to, subject, body, html, cc, bcc });

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId: threadId || undefined
      }
    }
  });

  return {
    success: true,
    draftId: res.data.id,
    messageId: res.data.message?.id,
    threadId: res.data.message?.threadId
  };
}

export async function listDrafts({ maxResults = 10 } = {}) {
  const gmail = createGmailClient();
  const res = await gmail.users.drafts.list({
    userId: 'me',
    maxResults: Math.min(maxResults, 50)
  });

  const drafts = res.data.drafts || [];
  const detailed = await Promise.all(
    drafts.map(async (d) => {
      try {
        const item = await gmail.users.drafts.get({
          userId: 'me',
          id: d.id,
          format: 'metadata'
        });
        const headers = item.data.message?.payload?.headers || [];
        return {
          draftId: d.id,
          messageId: item.data.message?.id,
          to: getHeader(headers, 'To') || '',
          subject: getHeader(headers, 'Subject') || '(No Subject)',
          snippet: item.data.message?.snippet || ''
        };
      } catch (e) {
        return { draftId: d.id, error: e.message };
      }
    })
  );

  return {
    totalDrafts: detailed.length,
    drafts: detailed
  };
}

export async function sendDraft({ draftId }) {
  const gmail = createGmailClient();
  const res = await gmail.users.drafts.send({
    userId: 'me',
    requestBody: { id: draftId }
  });

  return {
    success: true,
    messageId: res.data.id,
    threadId: res.data.threadId
  };
}

export async function modifyMessage({ messageId, addLabels = [], removeLabels = [] }) {
  const gmail = createGmailClient();
  const res = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: addLabels,
      removeLabelIds: removeLabels
    }
  });

  return {
    success: true,
    id: res.data.id,
    labelIds: res.data.labelIds
  };
}

export async function listLabels() {
  const gmail = createGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  return {
    labels: (res.data.labels || []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type
    }))
  };
}
