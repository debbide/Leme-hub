import { normalizeIsoTimestamp } from './common.js';

const ROUTING_HIT_HISTORY_LIMIT = 2000;

const ROUTING_HIT_READ_LIMIT = 300;

const pickConnectionBytes = (connection, keys) => {
  for (const key of keys) {
    const value = connection?.[key] ?? connection?.metadata?.[key] ?? connection?.stats?.[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
};

const pickConnectionTimestamp = (connection) => {
  const candidates = [
    connection?.timestamp,
    connection?.time,
    connection?.start,
    connection?.startAt,
    connection?.startedAt,
    connection?.createdAt,
    connection?.metadata?.timestamp,
    connection?.metadata?.time,
    connection?.metadata?.start,
    connection?.metadata?.createdAt
  ];

  for (const value of candidates) {
    const normalized = normalizeIsoTimestamp(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export {
  ROUTING_HIT_HISTORY_LIMIT,
  ROUTING_HIT_READ_LIMIT,
  pickConnectionBytes,
  pickConnectionTimestamp
};
