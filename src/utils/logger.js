import pino from 'pino';

// Create a sanitized structured logger that redacts any auth secrets or keys.
// Explicitly piping to process.stderr guarantees stdout remains 100% clean
// for standard stdio MCP JSON-RPC protocol transport!
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: ['key', 'keys', 'creds', 'password', 'token', 'SYNDAE_ACCESS_KEY', 'secret', 'auth'],
      censor: '[REDACTED_SECRET]'
    }
  },
  process.stderr
);

export default logger;
