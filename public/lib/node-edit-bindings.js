export const generateUuidV4 = ({ cryptoImpl = globalThis.crypto, randomImpl = Math.random } = {}) => {
  if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') {
    return cryptoImpl.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoImpl && typeof cryptoImpl.getRandomValues === 'function') {
    cryptoImpl.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(randomImpl() * 256) & 0xff;
    });
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
};

export const fillGeneratedUuid = ({ nodeForm, generateUuid = generateUuidV4 } = {}) => {
  const field = nodeForm?.elements?.uuid;
  if (!field) {
    return null;
  }

  const uuid = generateUuid();
  field.value = uuid;
  field.dispatchEvent?.(new Event('input', { bubbles: true }));
  field.dispatchEvent?.(new Event('change', { bubbles: true }));
  field.focus?.();
  field.select?.();
  return uuid;
};

export const bindNodeEditEvents = ({
  closeModalBtns,
  closeModal,
  saveNodeBtn,
  saveNodeEdit,
  saveRestartBtn,
  runCoreAction,
  generateUuidBtn,
  nodeForm,
}) => {
  closeModalBtns.forEach((button) => button.addEventListener('click', closeModal));

  saveNodeBtn?.addEventListener('click', saveNodeEdit);

  generateUuidBtn?.addEventListener('click', () => {
    fillGeneratedUuid({ nodeForm });
  });

  saveRestartBtn?.addEventListener('click', () => {
    runCoreAction('restart');
  });
};
