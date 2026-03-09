import { startServer } from './multiplayer/server';

void startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
