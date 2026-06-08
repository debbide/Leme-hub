const TOAST_ICONS = {
  success: 'ph ph-check-circle',
  error: 'ph ph-warning-circle',
  info: 'ph ph-info',
};

const normalizeToastType = (type) => (['success', 'error', 'info'].includes(type) ? type : 'info');

export const setControlBusy = (control, busyText = null, options = {}) => {
  if (!control) {
    return () => {};
  }
  const {
    restoreDisabled = true,
    restoreText = true
  } = options;

  const originalDisabled = Boolean(control.disabled);
  const originalText = control.textContent;

  control.disabled = true;
  control.setAttribute?.('aria-busy', 'true');
  if (control.dataset) {
    control.dataset.busy = 'true';
  }
  if (busyText !== null && busyText !== undefined) {
    control.textContent = busyText;
  }

  return () => {
    if (restoreDisabled) {
      control.disabled = originalDisabled;
    }
    control.removeAttribute?.('aria-busy');
    if (control.dataset) {
      delete control.dataset.busy;
    }
    if (restoreText && busyText !== null && busyText !== undefined) {
      control.textContent = originalText;
    }
  };
};

export const runWithButtonState = async (button, busyText, action, options = {}) => {
  const restore = setControlBusy(button, busyText, options);
  try {
    return await action();
  } finally {
    restore();
  }
};

export const createToastController = (toastContainer) => {
  const showToast = (message, type = 'info', options = {}) => {
    if (!toastContainer) {
      return;
    }
    const tone = normalizeToastType(type);
    const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : 3200;
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    toast.innerHTML = `
      <i class="toast-icon ${TOAST_ICONS[tone]}" aria-hidden="true"></i>
      <span class="toast-message"></span>
      <button type="button" class="toast-close" aria-label="Close notification">&times;</button>
    `;
    toast.querySelector('.toast-message').textContent = message;
    toastContainer.appendChild(toast);

    while (toastContainer.children.length > 4) {
      toastContainer.firstElementChild?.remove();
    }

    const dismiss = () => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.remove();
      }, { once: true });
    };

    toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
    if (durationMs > 0) {
      setTimeout(dismiss, durationMs);
    }
  };

  return { showToast };
};

export const showConfirmModal = (title, body) => new Promise((resolve) => {
  const overlay = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-body').textContent = body;
  overlay.classList.add('active');
  const finish = (val) => {
    overlay.classList.remove('active');
    document.getElementById('confirm-modal-ok').replaceWith(document.getElementById('confirm-modal-ok').cloneNode(true));
    document.getElementById('confirm-modal-cancel').replaceWith(document.getElementById('confirm-modal-cancel').cloneNode(true));
    resolve(val);
  };
  document.getElementById('confirm-modal-ok').addEventListener('click', () => finish(true));
  document.getElementById('confirm-modal-cancel').addEventListener('click', () => finish(false));
});

export const showInputModal = (title, defaultValue = '') => new Promise((resolve) => {
  const overlay = document.getElementById('input-modal');
  const titleEl = document.getElementById('input-modal-title');
  const field = document.getElementById('input-modal-field');
  const confirmBtn = document.getElementById('input-modal-confirm');
  const cancelBtn = document.getElementById('input-modal-cancel');
  const closeBtn = document.getElementById('input-modal-close');

  titleEl.textContent = title;
  field.value = defaultValue;
  overlay.classList.add('active');
  setTimeout(() => { field.focus(); field.select(); }, 50);

  const finish = (value) => {
    overlay.classList.remove('active');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    resolve(value);
  };

  document.getElementById('input-modal-confirm').addEventListener('click', () => finish(field.value));
  document.getElementById('input-modal-cancel').addEventListener('click', () => finish(null));
  document.getElementById('input-modal-close').addEventListener('click', () => finish(null));
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(field.value); if (e.key === 'Escape') finish(null); }, { once: true });
});
