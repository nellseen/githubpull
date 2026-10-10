import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import WebSocket from 'ws';
import { BotWebSocketManager } from '../src/websocket';

test('Feature Test: WebSocket Live Streamer & Relay (BotWebSocketManager)', async () => {
  const server = http.createServer();
  const wsManager = new BotWebSocketManager();

  let relayedChatId: string | number | null = null;
  let relayedText: string | null = null;

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address() as any;
  const port = address.port;

  wsManager.init(server, '/ws', async (chatId, text) => {
    relayedChatId = chatId;
    relayedText = text;
  });

  // Connect client
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  const initialMsg = await new Promise<string>((resolve) => {
    client.on('message', (data) => {
      resolve(data.toString());
    });
  });

  assert.equal(initialMsg.includes('CONNECTED'), true, 'Should receive CONNECTED status');
  assert.equal(wsManager.getSubscribersCount(), 1, 'Should track 1 active subscriber');

  // Test broadcast
  const broadcastPromise = new Promise<string>((resolve) => {
    client.once('message', (data) => {
      resolve(data.toString());
    });
  });

  wsManager.broadcast({ log: 'Test deployment progress line', status: 'PROGRESS' });
  const broadcastReceived = await broadcastPromise;
  assert.equal(broadcastReceived.includes('Test deployment progress line'), true);

  // Test sending message from client to trigger telegram relay
  client.send(JSON.stringify({
    chat_id: 12345678,
    log: 'Build success notification',
    status: 'SUCCESS',
  }));

  // Wait a short moment for callback
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(relayedChatId, 12345678, 'Chat ID should be relayed');
  assert.equal(relayedText?.includes('Build success notification'), true, 'Text should be relayed');

  // Cleanup
  client.close();
  wsManager.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
