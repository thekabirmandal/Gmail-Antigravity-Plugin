#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import * as client from './client.mjs';

const server = new Server(
  {
    name: 'gmail-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Define tool specifications
const TOOLS = [
  {
    name: 'gmail_status',
    description: 'Check Gmail connection status, current auth mode (OAuth2 or App Password), and active user email.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'gmail_search_emails',
    description:
      'Search emails using Gmail query syntax (e.g. "is:unread", "from:colleague@example.com", "subject:Meeting", "has:attachment", "after:2026/01/01"). Returns message IDs, senders, subjects, dates, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string (e.g., "is:unread", "from:support@github.com", "subject:invoice")'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)'
        },
        includeSpamTrash: {
          type: 'boolean',
          description: 'Whether to include messages from SPAM and TRASH (default: false)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'gmail_read_email',
    description:
      'Read the detailed content of an email message by ID, including subject, from, to, date, plain text body, labels, and attachment list.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The ID of the email message to retrieve'
        },
        format: {
          type: 'string',
          enum: ['clean', 'full'],
          description: 'Content format: "clean" for plain text body and metadata; "full" to include HTML body'
        }
      },
      required: ['messageId']
    }
  },
  {
    name: 'gmail_read_thread',
    description: 'Read an entire conversation thread by its thread ID in chronological order.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'The thread ID to fetch'
        }
      },
      required: ['threadId']
    }
  },
  {
    name: 'gmail_send_email',
    description:
      'Send an email to one or more recipients with optional CC, BCC, HTML body, and conversation thread association. Note: Always confirm with the user before sending real emails!',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address (or comma-separated addresses)'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        body: {
          type: 'string',
          description: 'Plain text body content'
        },
        html: {
          type: 'string',
          description: 'Optional HTML formatted body'
        },
        cc: {
          type: 'string',
          description: 'Optional CC email address(es)'
        },
        bcc: {
          type: 'string',
          description: 'Optional BCC email address(es)'
        },
        replyTo: {
          type: 'string',
          description: 'Optional Reply-To address'
        },
        threadId: {
          type: 'string',
          description: 'Optional thread ID to reply within an existing conversation'
        },
        inReplyTo: {
          type: 'string',
          description: 'Optional Message-ID header for threaded replies'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'gmail_create_draft',
    description: 'Create a draft email in Gmail without sending it. Useful for preparing messages for user review.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address'
        },
        subject: {
          type: 'string',
          description: 'Draft subject line'
        },
        body: {
          type: 'string',
          description: 'Plain text draft body content'
        },
        html: {
          type: 'string',
          description: 'Optional HTML formatted draft body'
        },
        cc: {
          type: 'string',
          description: 'Optional CC recipient'
        },
        bcc: {
          type: 'string',
          description: 'Optional BCC recipient'
        },
        threadId: {
          type: 'string',
          description: 'Optional thread ID to associate the draft with'
        }
      },
      required: ['body']
    }
  },
  {
    name: 'gmail_list_drafts',
    description: 'List current draft emails in Gmail.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum drafts to return (default: 10)'
        }
      }
    }
  },
  {
    name: 'gmail_send_draft',
    description: 'Send an existing draft email by its draft ID.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The draft ID to send'
        }
      },
      required: ['draftId']
    }
  },
  {
    name: 'gmail_modify_email',
    description:
      'Modify email labels: mark as read (remove "UNREAD"), archive (remove "INBOX"), star ("STARRED"), or trash.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The email message ID'
        },
        addLabels: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of label IDs to add (e.g. ["STARRED", "TRASH"])'
        },
        removeLabels: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of label IDs to remove (e.g. ["UNREAD", "INBOX"])'
        }
      },
      required: ['messageId']
    }
  },
  {
    name: 'gmail_list_labels',
    description: 'List all system and custom labels in the user account.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool invocation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result;
    switch (name) {
      case 'gmail_status':
        result = await client.getStatus();
        break;

      case 'gmail_search_emails':
        result = await client.searchEmails(args);
        break;

      case 'gmail_read_email':
        result = await client.readEmail(args);
        break;

      case 'gmail_read_thread':
        result = await client.readThread(args);
        break;

      case 'gmail_send_email':
        result = await client.sendEmail(args);
        break;

      case 'gmail_create_draft':
        result = await client.createDraft(args);
        break;

      case 'gmail_list_drafts':
        result = await client.listDrafts(args);
        break;

      case 'gmail_send_draft':
        result = await client.sendDraft(args);
        break;

      case 'gmail_modify_email':
        result = await client.modifyEmail(args);
        break;

      case 'gmail_list_labels':
        result = await client.listLabels(args);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${err.message}`
        }
      ]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gmail MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});
