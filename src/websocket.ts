import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

export interface WsLogData {
  chat_id?: string | number;
  log: string;
  status?: string;
  repo_name?: string;
  timestamp?: string;
}

export class BotWebSocketManager {
  private wss: WebSocketServer | null = null;
  private subscribers = new Set<WebSocket>();
  private onTelegramRelay?: (chatId: string | number, text: string) => Promise<void>;

  public init(server: http.Server, path: string = '/ws', onRelay?: (chatId: string | number, text: string) => Promise<void>) {
    this.onTelegramRelay = onRelay;
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws) => {
      this.subscribers.add(ws);

      ws.send(JSON.stringify({
        status: 'CONNECTED',
        log: 'Terhubung ke WebSocket Server GitHub Deployer Bot',
        timestamp: new Date().toISOString(),
      }));

      ws.on('message', async (messageData) => {
        try {
          const raw = messageData.toString();
          const parsed: WsLogData = JSON.parse(raw);
          if (parsed.chat_id && parsed.log && this.onTelegramRelay) {
            const status = parsed.status || 'INFO';
            await this.onTelegramRelay(
              parsed.chat_id,
              `<b>📡 [WS ${status}]</b>\n<code>${parsed.log}</code>`
            );
          }
        } catch (err: any) {
          console.warn('[WS Error] Gagal memproses data:', err.message);
        }
      });

      ws.on('close', () => {
        this.subscribers.delete(ws);
      });
    });
  }

  public broadcast(data: WsLogData | object): void {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data,
    });
    for (const client of this.subscribers) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public getSubscribersCount(): number {
    return this.subscribers.size;
  }

  public close(): void {
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsManager = new BotWebSocketManager();
