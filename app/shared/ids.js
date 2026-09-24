import crypto from 'crypto';

// Single source of truth for generated identifiers across the codebase.
// crypto.randomUUID() is collision-resistant and unpredictable, unlike the
// Math.random()-based short ids used historically.
export const createSecureId = () => crypto.randomUUID();

// Short, filesystem-friendly unique suffix for temp files (not a node id).
export const createTempSuffix = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
