import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');

// Primary credentials directories
const localCredsDir = path.join(pluginRoot, 'credentials');
const globalCredsDir = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'gmail', 'credentials');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function getCredentialsDir() {
  // If global dir exists or is standard config, prefer global if run as global plugin
  if (fs.existsSync(globalCredsDir)) {
    return globalCredsDir;
  }
  ensureDir(localCredsDir);
  return localCredsDir;
}

function findFile(filename) {
  const localPath = path.join(localCredsDir, filename);
  if (fs.existsSync(localPath)) return localPath;

  const globalPath = path.join(globalCredsDir, filename);
  if (fs.existsSync(globalPath)) return globalPath;

  return null;
}

export function loadOAuthClient() {
  // 1. Env vars
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    return {
      clientId: process.env.GMAIL_CLIENT_ID.trim(),
      clientSecret: process.env.GMAIL_CLIENT_SECRET.trim(),
      redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3549/oauth2callback'
    };
  }

  // 2. oauth_client.json
  const file = findFile('oauth_client.json');
  if (file) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.installed) {
        return {
          clientId: data.installed.client_id,
          clientSecret: data.installed.client_secret,
          redirectUri: data.installed.redirect_uris?.[0] || 'http://localhost:3549/oauth2callback'
        };
      }
      if (data.web) {
        return {
          clientId: data.web.client_id,
          clientSecret: data.web.client_secret,
          redirectUri: data.web.redirect_uris?.[0] || 'http://localhost:3549/oauth2callback'
        };
      }
      return {
        clientId: data.clientId || data.client_id,
        clientSecret: data.clientSecret || data.client_secret,
        redirectUri: data.redirectUri || data.redirect_uri || 'http://localhost:3549/oauth2callback'
      };
    } catch (e) {
      console.error('Error reading oauth_client.json:', e.message);
    }
  }

  return null;
}

export function loadOAuthTokens() {
  // 1. Env vars
  if (process.env.GMAIL_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim(),
      access_token: process.env.GMAIL_ACCESS_TOKEN?.trim()
    };
  }

  // 2. token.json
  const file = findFile('token.json');
  if (file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('Error reading token.json:', e.message);
    }
  }

  return null;
}

export function saveOAuthTokens(tokens) {
  const dir = getCredentialsDir();
  ensureDir(dir);
  const targetPath = path.join(dir, 'token.json');
  fs.writeFileSync(targetPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return targetPath;
}

export function saveOAuthClient(client) {
  const dir = getCredentialsDir();
  ensureDir(dir);
  const targetPath = path.join(dir, 'oauth_client.json');
  fs.writeFileSync(targetPath, JSON.stringify(client, null, 2), { mode: 0o600 });
  return targetPath;
}

export function loadAppPassword() {
  // 1. Env vars
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      user: process.env.GMAIL_USER.trim(),
      pass: process.env.GMAIL_APP_PASSWORD.trim().replace(/\s+/g, '')
    };
  }

  // 2. app_password.json
  const file = findFile('app_password.json');
  if (file) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.email && data.appPassword) {
        return {
          user: data.email.trim(),
          pass: data.appPassword.trim().replace(/\s+/g, '')
        };
      }
    } catch (e) {
      console.error('Error reading app_password.json:', e.message);
    }
  }

  return null;
}

export function saveAppPassword(email, appPassword) {
  const dir = getCredentialsDir();
  ensureDir(dir);
  const targetPath = path.join(dir, 'app_password.json');
  fs.writeFileSync(
    targetPath,
    JSON.stringify({ email: email.trim(), appPassword: appPassword.trim() }, null, 2),
    { mode: 0o600 }
  );
  return targetPath;
}

export function getAuthMode() {
  const oauthClient = loadOAuthClient();
  const oauthTokens = loadOAuthTokens();
  if (oauthClient && oauthTokens) {
    return 'oauth2';
  }

  const appPass = loadAppPassword();
  if (appPass) {
    return 'app_password';
  }

  return 'none';
}
