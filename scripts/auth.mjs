#!/usr/bin/env node

import readline from 'readline';
import http from 'http';
import url from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { google } from 'googleapis';
import {
  saveOAuthClient,
  saveOAuthTokens,
  saveAppPassword,
  getCredentialsDir
} from '../src/config.mjs';
import * as gmailApi from '../src/gmail_api.mjs';
import * as imapSmtp from '../src/imap_smtp.mjs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function openBrowser(targetUrl) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${targetUrl}"`, () => {});
}

async function runOAuthFlow(clientId, clientSecret, redirectUri = 'http://localhost:3549/oauth2callback') {
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n======================================================');
  console.log('       Google Cloud OAuth 2.0 Authorization');
  console.log('======================================================\n');
  console.log('Starting local authentication callback server on port 3549...');

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<html><body style="font-family:sans-serif;text-align:center;padding:50px;">' +
            '<h2 style="color:#2e7d32;">Authentication Successful!</h2>' +
            '<p>You can close this tab and return to the terminal / Antigravity.</p>' +
            '</body></html>'
          );
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>Authentication Failed: ${error}</h2>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
        }
      }
    });

    server.listen(3549, () => {
      console.log('\nOpening your browser to authenticate with Google...\n');
      console.log(`If it does not open automatically, visit this URL:\n\n${authUrl}\n`);
      openBrowser(authUrl);
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to bind callback server on port 3549: ${err.message}`));
    });
  });

  const code = await codePromise;
  console.log('Authorization code received! Exchanging for tokens...');

  const { tokens } = await oAuth2Client.getToken(code);
  saveOAuthClient({ clientId, clientSecret, redirectUri });
  saveOAuthTokens(tokens);

  console.log(`\nCredentials saved to: ${getCredentialsDir()}`);

  // Test connection
  try {
    const profile = await gmailApi.getProfile();
    console.log(`\nSUCCESS: Connected to Gmail as ${profile.emailAddress}!`);
    console.log(`Total messages in account: ${profile.messagesTotal}`);
  } catch (err) {
    console.log(`\nTokens saved, but verification returned: ${err.message}`);
  }
}

async function runAppPasswordFlow(email, password) {
  console.log('\nTesting connection with IMAP and SMTP...');
  saveAppPassword(email, password);

  try {
    const profile = await imapSmtp.getProfile();
    console.log(`\nSUCCESS: Connected via App Password as ${profile.emailAddress}!`);
    console.log(`Total messages in inbox: ${profile.messagesTotal} (Unread: ${profile.unseenTotal})`);
    console.log(`Credentials saved to: ${getCredentialsDir()}`);
  } catch (err) {
    console.error(`\nFailed to authenticate via App Password: ${err.message}`);
    console.error('Please verify that:');
    console.error('1. 2-Step Verification is enabled on your Google Account');
    console.error('2. You generated an App Password at https://myaccount.google.com/apppasswords');
    console.error('3. IMAP is enabled in Gmail Settings > Forwarding and POP/IMAP');
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Command-line flag shortcuts
  if (args.includes('--client-file')) {
    const filePath = args[args.indexOf('--client-file') + 1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('Error: Specified client file not found.');
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const info = raw.installed || raw.web || raw;
    await runOAuthFlow(info.client_id || info.clientId, info.client_secret || info.clientSecret);
    process.exit(0);
  }

  if (args.includes('--app-password')) {
    const idx = args.indexOf('--app-password');
    const email = args[idx + 1];
    const pass = args[idx + 2];
    if (!email || !pass) {
      console.error('Usage: node scripts/auth.mjs --app-password <email> <16-char-app-password>');
      process.exit(1);
    }
    await runAppPasswordFlow(email, pass);
    process.exit(0);
  }

  console.log('======================================================');
  console.log('       Gmail Antigravity Plugin Authentication');
  console.log('======================================================');
  console.log('Choose your authentication method:\n');
  console.log('1) Google Cloud OAuth 2.0 (Recommended)');
  console.log('   Full Gmail API support (threads, drafts, labels, search)');
  console.log('   Requires Client ID & Secret from Google Cloud Console.\n');
  console.log('2) Google App Password (Instant Setup)');
  console.log('   Simple 30-second setup using a 16-character App Password.');
  console.log('   Supports reading inbox & sending emails via IMAP/SMTP.\n');

  const choice = await question('Select an option (1 or 2): ');

  if (choice.trim() === '2') {
    console.log('\n--- Google App Password Setup ---');
    console.log('How to get an App Password:');
    console.log('1. Go to https://myaccount.google.com/apppasswords');
    console.log('2. Name it "Antigravity Gmail Plugin" and generate a 16-character password.');
    console.log('3. Ensure IMAP is enabled in Gmail Settings > Forwarding and POP/IMAP.\n');

    const email = await question('Enter your Gmail address: ');
    const pass = await question('Enter your 16-character App Password: ');

    if (!email || !pass) {
      console.error('Email and App Password are required.');
      process.exit(1);
    }
    await runAppPasswordFlow(email.trim(), pass.trim());
  } else {
    console.log('\n--- Google Cloud OAuth 2.0 Setup ---');
    console.log('If you have downloaded a credentials JSON file from GCP, you can enter its path.');
    console.log('Otherwise, press Enter to enter Client ID and Client Secret manually.\n');

    const jsonPath = await question('Path to client credentials JSON file (or press Enter): ');
    if (jsonPath.trim() && fs.existsSync(jsonPath.trim())) {
      const raw = JSON.parse(fs.readFileSync(jsonPath.trim(), 'utf8'));
      const info = raw.installed || raw.web || raw;
      await runOAuthFlow(info.client_id || info.clientId, info.client_secret || info.clientSecret);
    } else {
      const clientId = await question('Enter OAuth 2.0 Client ID: ');
      const clientSecret = await question('Enter OAuth 2.0 Client Secret: ');

      if (!clientId.trim() || !clientSecret.trim()) {
        console.error('Client ID and Client Secret are required.');
        process.exit(1);
      }
      await runOAuthFlow(clientId.trim(), clientSecret.trim());
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error('\nAuthentication setup error:', err.message);
  rl.close();
  process.exit(1);
});
