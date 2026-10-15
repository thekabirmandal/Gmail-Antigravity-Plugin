---
name: gmail
description: Read, search, summarize, draft, and send emails using Gmail. Use when the user wants to check their inbox, find specific emails, reply to messages, draft or send new emails, or manage Gmail labels.
---

# Gmail Workflow & Tool Guide

This skill guides the agent in interacting with the user's Gmail account via the Gmail plugin tools.

## Available Tools

- `gmail_status`: Checks connection status and displays authenticated email address.
- `gmail_search_emails`: Searches messages with query syntax (`is:unread`, `from:sender`, `subject:text`, etc.).
- `gmail_read_email`: Reads full message details, body text, and attachments by ID.
- `gmail_read_thread`: Reads all messages in a thread in chronological order.
- `gmail_send_email`: Sends an email to recipients.
- `gmail_create_draft`: Creates an email draft for review.
- `gmail_list_drafts`: Lists existing drafts.
- `gmail_send_draft`: Sends an existing draft.
- `gmail_modify_email`: Adds or removes labels (archive, mark read/unread, star).
- `gmail_list_labels`: Lists user and system labels.

---

## 1. Preflight Check

Before attempting email operations, check whether Gmail is authenticated:
1. Call `gmail_status`.
2. If `authenticated: false`, guide the user to authenticate by running:
   ```bash
   npm run auth
   ```
   or by configuring OAuth2 / App Password credentials as explained in the plugin README.

---

## 2. Common Workflows

### A. Checking & Summarizing Unread Emails
1. Call `gmail_search_emails` with `query: "is:unread label:INBOX"` and `maxResults: 10`.
2. For each relevant message, call `gmail_read_email` to read the body.
3. Present a clean, organized summary of new messages grouped by sender or priority.
4. Offer follow-up actions:
   - "Would you like me to draft a reply to any of these?"
   - "Should I mark these as read or archive any newsletter?"

### B. Searching for Specific Information
Use Gmail's advanced query syntax in `query`:
- From a specific person: `from:john@example.com`
- By subject keyword: `subject:"Q3 report"`
- With attachments: `has:attachment filename:pdf`
- Date range: `after:2026/10/01 before:2026/10/15`
- Sent messages: `label:SENT`

### C. Drafting & Sending Emails
1. Collect required details: recipient email, subject, key points or tone desired.
2. Compose the message body.
3. **Safety First**:
   - Prefer creating a draft with `gmail_create_draft` or display the complete draft in chat.
   - Show:
     - **To:** recipient@example.com
     - **Subject:** Subject text
     - **Body:** Full formatted text
   - Ask the user: *"Would you like me to send this email now or make any changes?"*
4. Only call `gmail_send_email` or `gmail_send_draft` after receiving user approval.

### D. Replying to an Existing Email Thread
1. Fetch the thread using `gmail_read_thread` with `threadId`.
2. Extract the last message's `subject` (prefixing `Re: ` if needed) and `messageIdHeader` for `inReplyTo`.
3. Pass `threadId` and `inReplyTo` when calling `gmail_send_email` or `gmail_create_draft` to maintain conversation threading.

### E. Archiving and Marking as Read
- **Mark as read**: Call `gmail_modify_email` with `messageId` and `removeLabels: ["UNREAD"]`.
- **Archive**: Call `gmail_modify_email` with `messageId` and `removeLabels: ["INBOX"]`.
- **Star**: Call `gmail_modify_email` with `messageId` and `addLabels: ["STARRED"]`.
