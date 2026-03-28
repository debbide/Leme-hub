process.env.LEME_MODE = process.env.LEME_MODE || 'server';

await import('../app/server/index.js');
