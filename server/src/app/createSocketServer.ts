import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/multiplayer-contracts';

export const createSocketServer = (app: Parameters<typeof createServer>[0]) => {
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: '*',
    },
  });

  return {
    httpServer,
    io,
  };
};
