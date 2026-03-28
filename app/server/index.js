import { startServer } from './start.js';

startServer(process.env).catch((error) => {
  console.error(error);
  process.exit(1);
});
