import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/multiplayer-contracts';

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createMultiplayerSocket = (url: string): MultiplayerSocket => {
  return io(url, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    timeout: 8000,
  });
};
