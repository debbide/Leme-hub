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
    throw new Error(body.error || 'Request failed');
  }
  return body;
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
