const $ = (id) => document.getElementById(id);

// WebAuthn 使用 Base64URL，先还原字符、剔除杂质并补齐 padding，避免 atob 抛错。
const b64ToBuffer = (value) => {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '');
  const padding = normalized.length % 4 === 0
    ? ''
    : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

// ArrayBuffer 序列化为 Base64URL（+→-、/→_、去掉 padding）。
// @simplewebauthn/server 只接受 base64url，普通 btoa 的标准 base64 会报
// "authenticatorData was not a base64url string"。
const bufferToB64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const errorBox = $('login-error');
const showError = (message) => {
  errorBox.textContent = message;
  errorBox.classList.add('visible');
};
const clearError = () => errorBox.classList.remove('visible');

const nextPath = (() => {
  try {
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      // Defense: if next points back to the login page itself (a stale
      // looped URL), fall back to the home page instead.
      const nextPathname = next.split('?')[0].split('#')[0];
      if (nextPathname !== '/login.html') {
        return next;
      }
    }
  } catch { /* ignore */ }
  return '/';
})();

const finishLogin = () => { location.replace(nextPath); };

const post = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败 (${response.status})`);
  }
  return data;
};

let pendingTicket = null;

// ---- 启动：探测认证状态 ----
(async () => {
  let state = null;
  try {
    const response = await fetch('/api/auth/state');
    state = await response.json();
  } catch {
    state = null;
  }
  if (!state || typeof state.needsSetup === 'undefined') {
    // 接口不可达：不静默降级到登录页（否则首次安装会看到永远登不进的登录表单）。
    // 显示明确错误，提示刷新重试。
    $('login-title').textContent = '连接失败';
    $('login-form').style.display = 'none';
    showError('无法获取认证状态，请确认服务已启动后刷新页面重试。');
    return;
  }
  if (!state.enabled) {
    // desktop 模式：无需登录，直接进主页
    location.replace(nextPath);
    return;
  }
  if (state.needsSetup) {
    $('login-title').textContent = '初始化设置';
    $('login-form').style.display = 'none';
    $('setup-form').style.display = 'block';
  }
})();

// ---- 首次设置 ----
$('setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  if ($('setup-password').value !== $('setup-password2').value) {
    showError('两次输入的密码不一致');
    return;
  }
  const btn = event.target.querySelector('.login-btn');
  btn.disabled = true;
  try {
    await post('/api/auth/setup', {
      username: $('setup-username').value,
      password: $('setup-password').value
    });
    finishLogin();
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
  }
});

// ---- 账号密码登录 ----
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const btn = $('login-submit');
  btn.disabled = true;
  try {
    const data = await post('/api/auth/login', {
      username: $('username').value,
      password: $('password').value,
      remember: $('remember').checked
    });
    if (data.twoFactor?.required) {
      pendingTicket = data.twoFactor.ticket;
      $('login-form').style.display = 'none';
      $('totp-form').style.display = 'block';
      $('totp-code').focus();
    } else {
      finishLogin();
    }
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
  }
});

// ---- TOTP 二步验证 ----
$('totp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const btn = event.target.querySelector('.login-btn');
  btn.disabled = true;
  try {
    await post('/api/auth/totp/verify', { ticket: pendingTicket, code: $('totp-code').value });
    finishLogin();
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
  }
});
$('totp-back').addEventListener('click', () => {
  pendingTicket = null;
  clearError();
  $('totp-form').style.display = 'none';
  $('login-form').style.display = 'block';
  $('login-submit').disabled = false;
  $('password').focus();
});

// ---- 通行密钥登录 ----
$('passkey-btn').addEventListener('click', async () => {
  clearError();
  try {
    if (!window.PublicKeyCredential) {
      throw new Error('当前浏览器不支持通行密钥');
    }
    const { options } = await post('/api/auth/passkey/login/challenge');
    const credential = await navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: b64ToBuffer(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((c) => ({
          ...c,
          id: b64ToBuffer(c.id)
        }))
      }
    });
    const serialized = {
      id: credential.id,
      rawId: bufferToB64(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToB64(credential.response.clientDataJSON),
        authenticatorData: bufferToB64(credential.response.authenticatorData),
        signature: bufferToB64(credential.response.signature),
        userHandle: credential.response.userHandle
          ? bufferToB64(credential.response.userHandle)
          : null
      }
    };
    await post('/api/auth/passkey/login/verify', { credential: serialized });
    finishLogin();
  } catch (error) {
    showError(error.message || '通行密钥登录失败');
  }
});
