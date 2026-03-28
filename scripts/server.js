process.env.LEME_MODE = process.env.LEME_MODE || 'server';

import { startServer } from '../app/server/start.js';

startServer(process.env).catch((error) => {
  console.error(error);
  process.exit(1);
});
