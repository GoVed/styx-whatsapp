import { Command } from 'commander';
import config from './config.js';
import { getBridge, createBridge } from './bridge/index.js';
import { startStdioServer } from './mcp/stdio.js';
import { startHttpServer } from './mcp/http.js';
import { createRelay } from './webhook/relay.js';
import { registerWithStyx } from './utils/register.js';
import { findStickers, getAllStickers, listCategories } from './stickers/search.js';
import logger from './utils/logger.js';

export function createCli() {
  const program = new Command();

  program
    .name('styx-whatsapp')
    .description('Bi-Directional WhatsApp Connector & MCP 2024-11-05 Server for Styx Agent OS')
    .version('1.0.0');

  // Command: daemon
  program
    .command('daemon')
    .description('Start background daemon (bridge + HTTP MCP server + Styx relay)')
    .option('-m, --mode <mode>', 'Bridge mode: "live" or "mock"', config.mode)
    .option('-p, --port <port>', 'MCP HTTP server port', String(config.httpPort))
    .option('-h, --host <host>', 'MCP HTTP server host', config.httpHost)
    .option('--styx-url <url>', 'Styx Agent OS API URL', config.styxApiUrl)
    .option('--dev', 'Run in development mode with debug logging')
    .action(async (opts) => {
      const mode = opts.mode || config.mode;
      const port = parseInt(opts.port, 10);
      const host = opts.host;
      const styxUrl = opts.styxUrl;

      logger.info({ mode, port, host, styxUrl }, 'Starting Styx WhatsApp Micro-Daemon...');

      const bridge = getBridge(mode);
      await bridge.connect().catch((err) => {
        logger.error({ err }, 'Bridge connection failed during daemon startup');
      });

      // Start bi-directional Styx relay
      const relay = createRelay(bridge, { styxApiUrl: styxUrl });
      relay.start();

      // Start HTTP server sharing the same bridge instance and relay
      const { server } = await startHttpServer({ port, host, mode, bridge, relay });

      const shutdown = async () => {
        logger.info('Shutting down WhatsApp daemon...');
        relay.stop();
        server.close();
        await bridge.disconnect().catch(() => {});
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

  // Command: mcp
  program
    .command('mcp')
    .description('Start stdio MCP 2024-11-05 Server for direct subprocess piping')
    .option('-m, --mode <mode>', 'Bridge mode: "live" or "mock"', config.mode)
    .action(async (opts) => {
      await startStdioServer({ mode: opts.mode });
    });

  // Command: login
  program
    .command('login')
    .description('Pair WhatsApp Web terminal QR code in live mode and save credentials')
    .action(async () => {
      logger.info('Starting WhatsApp pairing login flow (live mode)...');
      const bridge = createBridge('live');

      bridge.on('connection', async ({ state, user }) => {
        if (state === 'connected') {
          process.stderr.write(`\n✓ WhatsApp successfully paired and connected! Phone: ${user.phone}\n`);
          process.stderr.write(`Session credentials saved to: ${config.authDir}\n\n`);
          await bridge.disconnect();
          process.exit(0);
        }
      });

      await bridge.connect().catch((err) => {
        logger.error({ err }, 'Login error');
        process.exit(1);
      });
    });

  // Command: status
  program
    .command('status')
    .description('Display status of WhatsApp bridge and local session credentials')
    .option('-r, --remote', 'Query running HTTP daemon health endpoint instead of local bridge')
    .option('-p, --port <port>', 'Daemon port if querying remote', String(config.httpPort))
    .action(async (opts) => {
      if (opts.remote) {
        try {
          const resp = await fetch(`http://${config.httpHost}:${opts.port}/status`);
          const data = await resp.json();
          process.stdout.write(JSON.stringify(data, null, 2) + '\n');
        } catch (err) {
          process.stderr.write(`Failed to reach daemon: ${err.message}\n`);
          process.exit(1);
        }
        return;
      }

      const bridge = getBridge(config.mode);
      const st = bridge.getStatus();
      const output = {
        config_mode: config.mode,
        auth_dir: config.authDir,
        styx_api_url: config.styxApiUrl,
        bridge: st
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    });

  // Command: trigger
  program
    .command('trigger')
    .description('Simulate an incoming WhatsApp message and dispatch it to Styx Agent OS')
    .requiredOption('-m, --message <text>', 'Message text to trigger Styx OS')
    .option('-f, --from <phone>', 'Sender phone number', '+1234567890')
    .option('-n, --name <name>', 'Sender display name', 'Alice')
    .option('-g, --group', 'Simulate message from a group', false)
    .option('--group-id <jid>', 'Simulate group JID', '120363000000000000@g.us')
    .option('--styx-url <url>', 'Styx API URL', config.styxApiUrl)
    .action(async (opts) => {
      const bridge = getBridge('mock');
      const relay = createRelay(bridge, { styxApiUrl: opts.styxUrl });

      process.stdout.write(`\nDispatching inbound WhatsApp trigger to Styx OS...\n`);
      process.stdout.write(`Sender: ${opts.name} (${opts.from})\n`);
      process.stdout.write(`Message: "${opts.message}"\n\n`);

      const simulatedEvent = {
        from: opts.from,
        senderName: opts.name,
        senderJid: bridge.formatJid(opts.from),
        message: opts.message,
        timestamp: Math.floor(Date.now() / 1000),
        messageId: `CLI_TRIG_${Date.now()}`,
        isGroup: opts.group,
        chatJid: opts.group ? opts.groupId : bridge.formatJid(opts.from)
      };

      const result = await relay.forwardEvent(simulatedEvent);
      process.stdout.write('Styx Relay Result:\n' + JSON.stringify(result, null, 2) + '\n');
      process.exit(result.success ? 0 : 1);
    });

  // Command: register
  program
    .command('register')
    .description('Auto-register this WhatsApp MCP server directly into Styx (POST /api/tools/servers)')
    .option('-t, --transport <transport>', 'Transport type: "stdio" or "http"', 'stdio')
    .option('--styx-url <url>', 'Styx API URL', config.styxApiUrl)
    .option('--access-key <key>', 'Styx Access Key', config.styxAccessKey)
    .option('--name <name>', 'Registered MCP Server Name in Styx', 'whatsapp')
    .option('-m, --mode <mode>', 'Bridge mode: "live" or "mock"', config.mode)
    .option('-p, --port <port>', 'HTTP port if registering HTTP transport', String(config.httpPort))
    .action(async (opts) => {
      process.stdout.write(`Registering WhatsApp connector with Styx (${opts.transport} transport)...\n`);
      const res = await registerWithStyx({
        styxUrl: opts.styxUrl,
        accessKey: opts.accessKey,
        transport: opts.transport,
        serverName: opts.name,
        mode: opts.mode,
        port: parseInt(opts.port, 10)
      });

      if (res.success) {
        process.stdout.write('✓ Registration succeeded!\n');
        process.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
        process.exit(0);
      } else {
        process.stderr.write(`✗ Registration failed: ${res.error}\n`);
        process.exit(1);
      }
    });

  // Command: stickers
  program
    .command('stickers')
    .description('Query the sticker catalog (supporting emotional context search)')
    .argument('[search]', 'Search query or emotional context (e.g. "sad cat", "thumbs up", "celebrate")')
    .option('-c, --category <category>', 'Filter by category')
    .option('-l, --limit <limit>', 'Maximum results', '10')
    .action((search, opts) => {
      if (search) {
        const results = findStickers({
          search,
          category: opts.category,
          limit: parseInt(opts.limit, 10)
        });
        process.stdout.write(`Sticker search results for: "${search}" (${results.length} matches)\n\n`);
        for (const s of results) {
          process.stdout.write(`- [${s.id}] ${s.name} (${s.category}, score: ${s.score})\n`);
          process.stdout.write(`  Context: ${s.emotional_context}\n`);
          process.stdout.write(`  Tags: ${s.tags.join(', ')}\n\n`);
        }
      } else {
        const stickers = getAllStickers();
        const categories = listCategories();
        process.stdout.write(`Sticker Catalog (${stickers.length} stickers in ${categories.length} categories: ${categories.join(', ')})\n\n`);
        for (const s of stickers) {
          process.stdout.write(`- [${s.id}] ${s.name} (${s.category})\n  ${s.description}\n`);
        }
      }
    });

  return program;
}

export default createCli;
