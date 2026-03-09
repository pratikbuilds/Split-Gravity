import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/multiplayer-contracts';

export type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createMultiplayerSocket = (url: string): MultiplayerSocket => {
  return io(url, {
    autoConnect: false,
    // Do not force websocket-only transport here. Mobile networks and edge proxies can reject
    // the direct websocket path, while Socket.IO polling can still connect and then upgrade.
    reconnection: true,
    reconnectionAttempts: 8,
    timeout: 8000,
  });
};
