export const createToastController = (toastContainer) => {
  const showToast = (message, type = 'info') => {
    if (!toastContainer) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => {
        if (toast.parentNode) toast.remove();
      });
    }, 3000);
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
