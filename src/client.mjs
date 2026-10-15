import { getAuthMode } from './config.mjs';
import * as gmailApi from './gmail_api.mjs';
import * as imapSmtp from './imap_smtp.mjs';

export async function getStatus() {
  const mode = getAuthMode();
  if (mode === 'none') {
    return {
      authenticated: false,
      mode: 'none',
      message:
        'Gmail credentials not found. Please authenticate by running "npm run auth" or setting environment variables (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET or GMAIL_USER / GMAIL_APP_PASSWORD).'
    };
  }

  try {
    if (mode === 'oauth2') {
      const profile = await gmailApi.getProfile();
      return {
        authenticated: true,
        mode: 'oauth2 (Gmail REST API)',
        email: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal
      };
    } else {
      const profile = await imapSmtp.getProfile();
      return {
        authenticated: true,
        mode: 'app_password (IMAP/SMTP)',
        email: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        unseenTotal: profile.unseenTotal
      };
    }
  } catch (err) {
    return {
      authenticated: false,
      mode,
      error: err.message,
      message: `Authentication test failed: ${err.message}. Please re-run "npm run auth".`
    };
  }
}

export async function searchEmails(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.searchMessages(params);
  } else {
    return await imapSmtp.searchMessages(params);
  }
}

export async function readEmail(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.getMessage(params);
  } else {
    return await imapSmtp.getMessage(params);
  }
}

export async function readThread(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.getThread(params);
  } else {
    // Fallback for IMAP
    return await imapSmtp.getMessage({ messageId: params.threadId });
  }
}

export async function sendEmail(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.sendEmail(params);
  } else {
    return await imapSmtp.sendEmail(params);
  }
}

export async function createDraft(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.createDraft(params);
  } else {
    throw new Error('Draft creation is only supported when connected via OAuth2 (Gmail API).');
  }
}

export async function listDrafts(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.listDrafts(params);
  } else {
    throw new Error('Listing drafts is only supported when connected via OAuth2 (Gmail API).');
  }
}

export async function sendDraft(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.sendDraft(params);
  } else {
    throw new Error('Sending drafts is only supported when connected via OAuth2 (Gmail API).');
  }
}

export async function modifyEmail(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.modifyMessage(params);
  } else {
    return await imapSmtp.modifyMessage(params);
  }
}

export async function listLabels(params) {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error('Not authenticated with Gmail. Please run "npm run auth" to configure.');
  }
  if (mode === 'oauth2') {
    return await gmailApi.listLabels(params);
  } else {
    return {
      labels: [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'SENT', name: 'SENT', type: 'system' },
        { id: 'UNREAD', name: 'UNREAD', type: 'system' }
      ]
    };
  }
}
