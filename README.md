# Gmail Antigravity Plugin

An official Antigravity plugin for Gmail that allows your AI agent to read your inbox, search messages with native query syntax, read email threads, compose drafts, and send emails safely.

---

## Features

- **Read & Search Emails**: Full Gmail search syntax support (`is:unread`, `from:someone@domain.com`, `subject:Report`, `after:2026/01/01`, `has:attachment`).
- **Thread & Conversation Support**: View complete email chains in chronological order.
- **Compose & Draft**: Create drafts in Gmail so you can review them in the Gmail web app or mobile app before sending.
- **Outbound Email Safety**: Built-in safety guards requiring user confirmation before sending real messages.
- **Dual Authentication Modes**:
  1. **Google Cloud OAuth 2.0 (Gmail API)**: Full API features including labels, drafts, and thread IDs.
  2. **Google App Password (IMAP / SMTP)**: Instant 30-second setup without needing a Google Cloud project.

---

## Getting Started

### 1. Install & Link Plugin

To install this plugin into your global Antigravity environment (`~/.gemini/config/plugins/gmail`):

```bash
# From this directory:
mkdir -p ~/.gemini/config/plugins
ln -s "$(pwd)" ~/.gemini/config/plugins/gmail
```

*(Or simply restart Antigravity if you are already inside this workspace directory).*

---

### 2. Authenticate Your Gmail Account

Run the interactive authentication setup CLI:

```bash
npm run auth
```

You will be presented with two authentication options:

#### Option A: Google Cloud OAuth 2.0 (Recommended)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select an existing one) and enable the **Gmail API** under **APIs & Services > Library**.
3. Under **APIs & Services > OAuth consent screen**, select **External** (or Internal for Workspace), fill in your app name, and add test user emails (your Gmail address).
4. Go to **APIs & Services > Credentials** > **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application** (or Desktop application)
   - Authorized redirect URIs: `http://localhost:3549/oauth2callback`
5. Run `npm run auth`, select Option 1, and paste your **Client ID** and **Client Secret** (or pass the downloaded JSON file).
6. Your browser will open to complete the Google login and consent flow. Once granted, tokens are stored securely in `credentials/`.

#### Option B: Google App Password (Instant Setup)
If you do not want to configure a Google Cloud project:
1. Ensure **2-Step Verification** is turned on for your Google Account.
2. Go to [Google Account App Passwords](https://myaccount.google.com/apppasswords).
3. Create a new App Password named **Antigravity Gmail Plugin** and copy the 16-character code.
4. Ensure IMAP is enabled in **Gmail Settings > Forwarding and POP/IMAP**.
5. Run `npm run auth`, select Option 2, and enter your Gmail address and 16-character password.

---

### 3. Verify Connection

Check that your authentication is working properly at any time:

```bash
npm run status
```

---

## Available MCP Tools

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| `gmail_status` | Check authentication status and active email account | *(none)* |
| `gmail_search_emails` | Search messages using Gmail query syntax | `query` (required), `maxResults` |
| `gmail_read_email` | Read message subject, headers, body text, and attachments | `messageId` (required), `format` (`"clean"` or `"full"`) |
| `gmail_read_thread` | Read full conversation thread chronologically | `threadId` (required) |
| `gmail_create_draft` | Create a draft email in Gmail without sending | `body` (required), `to`, `subject`, `html`, `cc` |
| `gmail_list_drafts` | List current drafts in your account | `maxResults` |
| `gmail_send_draft` | Send an existing draft by its ID | `draftId` (required) |
| `gmail_send_email` | Send a new email directly | `to`, `subject`, `body` (all required), `cc`, `bcc`, `html` |
| `gmail_modify_email` | Modify labels (mark read/unread, archive, star) | `messageId`, `addLabels`, `removeLabels` |
| `gmail_list_labels` | List all system and user labels | *(none)* |

---

## Safety Guidelines

- **Confirmation Before Sending**: The plugin includes explicit agent rules requiring explicit user approval before calling `gmail_send_email` or `gmail_send_draft`.
- **Privacy Protection**: Credentials are saved with restricted permissions (`0600`) in `credentials/`. Never commit `credentials/` to public repositories.

---

## Directory Structure

```text
├── plugin.json              # Antigravity plugin manifest
├── mcp_config.json          # MCP server configuration
├── package.json             # Node dependencies and scripts
├── assets/
│   └── logo.svg             # High-contrast plugin icon
├── bin/
│   └── run.sh               # Robust Node.js executable wrapper
├── src/
│   ├── index.mjs            # Stdio MCP server
│   ├── client.mjs           # Unified provider router
│   ├── gmail_api.mjs        # Gmail REST API implementation (OAuth2)
│   ├── imap_smtp.mjs        # IMAP & SMTP implementation (App Password)
│   └── config.mjs           # Credential & token manager
├── scripts/
│   ├── auth.mjs             # Interactive CLI auth wizard
│   └── status.mjs           # Status verification script
├── skills/
│   └── gmail/
│       └── SKILL.md         # Agent skill workflow instructions
├── rules/
│   └── AGENTS.md            # Safety rules & confirmation guards
└── agents/
    └── email-assistant.md   # Specialized email assistant agent definition
```
