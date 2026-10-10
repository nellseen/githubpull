import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { GitHubDeployerBot } from './bot';
import { wsManager } from './websocket';
import { loadGithubAccounts } from './github';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_DIR = process.env.BASE_DIR || path.join(process.cwd(), 'deployments');

async function main() {
  console.log('----------------------------------------------------');
  console.log('🤖 Starting GitHub Pull & Deployer Telegram Bot...');
  console.log('----------------------------------------------------');

  const botInstance = new GitHubDeployerBot(BASE_DIR);

  // Create HTTP server for Port 3000 binding (AI Studio requirement) and status inspection
  const server = http.createServer(async (req, res) => {
    // Basic CORS and JSON header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/' || req.url === '/status' || req.url === '/health') {
      const statusData = {
        app: 'GitHub Pull & Deployer Telegram Bot',
        status: 'online',
        port: PORT,
        baseDir: BASE_DIR,
        telegramBotRunning: botInstance.isRunning,
        activeGitHubAccounts: botInstance.accounts.map((a) => ({
          index: a.index,
          username: a.username,
          email: a.email,
          public_repos: a.public_repos,
        })),
        accountsCount: botInstance.accounts.length,
        wsSubscribers: wsManager.getSubscribersCount(),
        serverTime: new Date().toISOString(),
        nodeVersion: process.version,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusData, null, 2));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found. Check /status for bot health.' }));
  });

  // Attach WebSocket server on the same HTTP server
  wsManager.init(server, '/ws', async (chatId, text) => {
    if (botInstance.bot) {
      try {
        await botInstance.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
      } catch (err: any) {
        console.warn(`[Telegram Relay Error]: ${err.message}`);
      }
    }
  });

  // Start HTTP server on 0.0.0.0:3000
  server.listen(PORT, '0.0.0.0', async () => {
    console.log(`📡 HTTP & WebSocket Status Server running at http://0.0.0.0:${PORT}`);
    console.log(`📁 Base Deployments Directory: ${BASE_DIR}`);

    // Initialize Telegram bot
    await botInstance.init();
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    botInstance.stop();
    wsManager.close();
    server.close(() => {
      console.log('✅ Server closed. Goodbye!');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
