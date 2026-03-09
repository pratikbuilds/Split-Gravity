import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/multiplayer-contracts';
import { env } from '../config/env';

export const createSocketServer = (app: Parameters<typeof createServer>[0]) => {
  const httpServer = createServer(app);
  const allowedOrigins = env.SOCKET_IO_CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins?.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Socket.IO origin not allowed'));
      },
    },
  });

  return {
    httpServer,
    io,
  };
};
