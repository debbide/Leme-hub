export const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
};

const parseSseEvent = (raw) => {
  const event = { event: 'message', data: '' };
  raw.split(/\r?\n/u).forEach((line) => {
    if (!line || line.startsWith(':')) {
      return;
    }
    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1
      ? ''
      : line.slice(separatorIndex + 1).replace(/^ /u, '');
    if (field === 'event') {
      event.event = value || 'message';
    } else if (field === 'data') {
      event.data += event.data ? `\n${value}` : value;
    }
  });
  if (!event.data) {
    return { event: event.event, data: null };
  }
  try {
    return { event: event.event, data: JSON.parse(event.data) };
  } catch {
    return { event: event.event, data: event.data };
  }
};

export const requestSseStream = async (url, options = {}, onEvent = () => {}) => {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    ...options
  });
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = { error: await response.text().catch(() => '') };
    }
    const error = new Error(body?.error || 'Request failed');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  if (!response.body?.getReader) {
    throw new Error('Streaming response is not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const trimmed = frame.trim();
      if (trimmed) {
        await onEvent(parseSseEvent(trimmed));
      }
    }
    if (done) {
      const trimmed = buffer.trim();
      if (trimmed) {
        await onEvent(parseSseEvent(trimmed));
      }
      break;
    }
  }
};

const removeClipboardTextarea = (textarea) => {
  if (!textarea) {
    return;
  }

  if (typeof textarea.remove === 'function') {
    textarea.remove();
    return;
  }

  if (textarea.parentNode && typeof textarea.parentNode.removeChild === 'function') {
    textarea.parentNode.removeChild(textarea);
  }
};

const copyTextWithExecCommand = (value) => {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false;
  }

  const container = document.body || document.documentElement;
  if (!container || typeof container.appendChild !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute?.('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  container.appendChild(textarea);
  textarea.focus?.();
  textarea.select?.();

  try {
    return typeof document.execCommand === 'function'
      ? document.execCommand('copy')
      : false;
  } finally {
    removeClipboardTextarea(textarea);
  }
};

export const copyTextToClipboard = async (value) => {
  const text = String(value ?? '');
  let lastError = null;

  if (typeof navigator !== 'undefined'
    && navigator.clipboard
    && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (copyTextWithExecCommand(text)) {
    return;
  }

  throw lastError || new Error('请检查浏览器剪贴板权限');
};

export const flagFromCountryCode = (countryCode) => {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    return null;
  }

  return String.fromCodePoint(...[...normalized].map((char) => 0x1F1E6 + char.charCodeAt(0) - 65));
};
