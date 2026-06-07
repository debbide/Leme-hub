const createHttpError = (message, status) => Object.assign(new Error(message), { status });

const createNodeId = () => Math.random().toString(36).slice(2, 10);

const getNodeSignature = (node) => [
  node.type || '',
  node.server || '',
  node.port || '',
  node.uuid || '',
  node.password || '',
  node.method || ''
].join('|');

const validatePort = (value, fieldName) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw createHttpError(`${fieldName} must be a valid TCP port`, 400);
  }

  return parsed;
};

const normalizeCountryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
};

const normalizeIsoTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
};

const truncateText = (value, max = 120) => {
  const text = String(value || '').trim();
  if (!text || text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 3))}...`;
};

export {
  createHttpError,
  createNodeId,
  getNodeSignature,
  normalizeCountryCode,
  normalizeIsoTimestamp,
  truncateText,
  validatePort
};
