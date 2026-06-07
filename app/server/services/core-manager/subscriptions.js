const normalizeSubscriptionRecord = (record, index) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const url = String(record.url || '').trim();
  if (!url) {
    return null;
  }

  return {
    id: record.id || `subscription-${index + 1}`,
    url,
    name: String(record.name || '').trim() || url,
    groupName: String(record.groupName || '').trim() || null,
    importedCount: Number.parseInt(record.importedCount, 10) || 0,
    lastSyncedAt: record.lastSyncedAt || null,
    lastNodeCount: Number.parseInt(record.lastNodeCount, 10) || 0,
    lastStatus: String(record.lastStatus || '').trim() || 'idle',
    lastError: String(record.lastError || '').trim() || null
  };
};

const deriveSubscriptionDisplayName = (url, preferredName = '') => {
  const normalizedName = String(preferredName || '').trim();
  if (normalizedName) {
    return normalizedName;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
};

const buildUniqueSubscriptionGroupName = (baseName, occupiedNames) => {
  const normalizedBase = String(baseName || '').trim() || 'Subscription';
  if (!occupiedNames.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (occupiedNames.has(`${normalizedBase} ${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase} ${suffix}`;
};

export {
  buildUniqueSubscriptionGroupName,
  deriveSubscriptionDisplayName,
  normalizeSubscriptionRecord
};
