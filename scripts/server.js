process.env.LEME_MODE = process.env.LEME_MODE || 'server';

import { startServer } from '../app/server/start.js';

await startServer(process.env);
