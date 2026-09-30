export const TOOL_DEFINITIONS = [
  {
    name: 'find_stickers',
    description: 'Search the sticker catalog by emotional context, tags, or keywords (e.g. "sad cat", "thumbs up", "shrug", "celebrate"). Returns matching sticker IDs, descriptions, and scores according to memory/skills/whatsapp_tone.md.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search query or emotional context (e.g. "sad cat", "thumbs up", "shrug", "declining invitation")'
        },
        query: {
          type: 'string',
          description: 'Alternative alias for search query'
        },
        category: {
          type: 'string',
          description: 'Optional category filter: "cat", "reaction", "celebration", "animal", "lifestyle"'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of stickers to return (default 5)'
        }
      }
    }
  },
  {
    name: 'send_sticker',
    description: 'Dispatch a rich WebP sticker or animated sticker/GIF to a WhatsApp contact or group. Accepts either a catalog sticker_id from find_stickers OR an HTTP(S) image/GIF/WebP URL (such as returned by download_sticker_as_webp or web sticker search).',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient contact name (e.g. "Alice"), phone number (e.g. "+1234567890"), or WhatsApp JID'
        },
        sticker_id: {
          type: 'string',
          description: 'A valid sticker ID from find_stickers (e.g. "cat_shrug", "cat_celebrate", "fire_lit") OR a direct image/WebP/GIF URL (from download_sticker_as_webp or web search). Do NOT invent custom sticker names; pass the image/sticker URL if not using a catalog ID.'
        }
      },
      required: ['to', 'sticker_id']
    }
  },
  {
    name: 'send_message',
    description: 'Send a plain text message to a WhatsApp contact or group chat.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient contact name (e.g. "Alice"), phone number (e.g. "+1234567890"), or WhatsApp JID (e.g. "155500011122233@lid" or "1234567890@s.whatsapp.net")'
        },
        message: {
          type: 'string',
          description: 'Text content to send'
        }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'send_reaction',
    description: 'Send an emoji reaction to a specific WhatsApp message.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number or chat JID'
        },
        message_id: {
          type: 'string',
          description: 'WhatsApp ID of the message to react to'
        },
        emoji: {
          type: 'string',
          description: 'Emoji character to react with (e.g. "👍", "❤️", "😿", "🔥", "🎉")'
        }
      },
      required: ['to', 'message_id', 'emoji']
    }
  },
  {
    name: 'get_whatsapp_status',
    description: 'Query the current state of the WhatsApp bridge, active mode (live or mock), and connection details.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_chat_history',
    description: 'Retrieve message history handled by this bridge with optional filtering by contact/group name (e.g. "Computer Scientist"), keyword search, or direction.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent messages to return (default 20, max 100)'
        },
        chat: {
          type: 'string',
          description: 'Contact name (e.g. "Engineering Team", "Alice"), phone number, or chat JID'
        },
        chat_jid: {
          type: 'string',
          description: 'Optional filter by contact JID or phone number'
        },
        search: {
          type: 'string',
          description: 'Optional keyword to search inside message text or sender names'
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound', 'all'],
          description: 'Filter by message direction (default "all")'
        },
        fetch_older: {
          type: 'boolean',
          description: 'When true, requests older messages from the primary phone via on-demand peer sync before returning'
        }
      }
    }
  },
  {
    name: 'fetch_older_messages',
    description: 'Requests earlier/older message history from the primary phone for a specific WhatsApp chat or group via on-demand peer sync.',
    inputSchema: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Target contact name (e.g. "Engineering Team", "Alice"), phone number, or chat JID'
        },
        count: {
          type: 'number',
          description: 'Number of earlier messages to request from phone (default 50)'
        }
      },
      required: ['chat']
    }
  },
  {
    name: 'list_chats',
    description: 'List recent active WhatsApp chats/conversations with contact names, phone numbers, unread counts, and last message snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of chats to return (default 20)'
        }
      }
    }
  },
  {
    name: 'simulate_inbound_message',
    description: 'Simulate an incoming WhatsApp message into the bridge and trigger the Styx reactive agent OS workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Sender phone number (e.g. "+1234567890")'
        },
        message: {
          type: 'string',
          description: 'Incoming text content'
        },
        sender_name: {
          type: 'string',
          description: 'Display name of sender (default: "Alice")'
        },
        is_group: {
          type: 'boolean',
          description: 'Whether this message is from a group chat (default: false)'
        },
        group_id: {
          type: 'string',
          description: 'Optional group JID if is_group is true'
        }
      },
      required: ['from', 'message']
    }
  },
  {
    name: 'import_chat_export',
    description: 'Ingest a complete WhatsApp chat history export file (.txt) into Styx message history and memory. Parses thousands of messages across iOS and Android formats with chronological ordering, deduplication, and participant extraction.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the exported WhatsApp .txt file on disk'
        },
        content: {
          type: 'string',
          description: 'Raw text content of the exported WhatsApp chat (alternative to file_path)'
        },
        chat: {
          type: 'string',
          description: 'Optional target contact or group name (e.g. "Engineering Team") or WhatsApp JID'
        },
        chat_name: {
          type: 'string',
          description: 'Optional explicit group or contact display name'
        },
        chat_jid: {
          type: 'string',
          description: 'Optional explicit WhatsApp JID (e.g. "15551234567-1600000000@g.us")'
        }
      }
    }
  }
];
