// 安全设置模块：修改密码、TOTP 两步验证、通行密钥管理。
// 仅在 server 模式（auth enabled）下显示；desktop 模式整块隐藏。

const $ = (id) => document.getElementById(id);

const b64ToBuffer = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const bufferToB64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

async function postJson(url, body, { method = 'POST' } = {}) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败 (${response.status})`);
  }
  return data;
}

export function initSecuritySettings({ showToast }) {
  const card = $('security-card');
  if (!card) {
    return;
  }

  // ---- 状态加载 ----

  async function loadSecurityState() {
    try {
      const state = await postJson('/api/auth/state', undefined, { method: 'GET' });
      if (!state.enabled) {
        ['security-card', 'security-pwd-row', 'security-totp-row', 'security-passkey-row'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        return;
      }
      ['security-card', 'security-pwd-row', 'security-totp-row', 'security-passkey-row'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = ''; });
      const me = await postJson('/api/auth/me', undefined, { method: 'GET' });
      $('security-account-note').textContent = `当前账号：${me.user.username}`;
      renderTotpStatus(me.user.totpEnabled);
      await loadPasskeys();
    } catch (error) {
      // 未登录或会话过期：隐藏安全卡片
      ['security-card', 'security-pwd-row', 'security-totp-row', 'security-passkey-row'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    }
  }

  function renderTotpStatus(enabled) {
    $('totp-status').textContent = enabled ? '已启用' : '未启用';
    $('totp-status').style.color = enabled ? 'var(--accent)' : 'var(--text-muted)';
    $('totp-enable-btn').style.display = enabled ? 'none' : '';
    $('totp-disable-btn').style.display = enabled ? '' : 'none';
    if (!enabled) {
      $('totp-enroll-row').style.display = 'none';
    }
  }

  // ---- 修改密码 ----

  $('pwd-change-btn').addEventListener('click', async () => {
    const current = $('pwd-current').value;
    const next = $('pwd-new').value;
    const confirm = $('pwd-confirm').value;
    if (!current || !next) {
      showToast('请填写当前密码和新密码', 'error');
      return;
    }
    if (next !== confirm) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    if (next.length < 8) {
      showToast('新密码至少 8 位', 'error');
      return;
    }
    try {
      await postJson('/api/auth/password/change', { currentPassword: current, newPassword: next });
      showToast('密码已修改，所有会话已失效，即将跳转登录页', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // ---- TOTP ----

  $('totp-enable-btn').addEventListener('click', async () => {
    try {
      const data = await postJson('/api/auth/totp/begin');
      $('totp-secret-input').value = data.secret;
      $('totp-enroll-row').style.display = '';
      // 生成二维码（无外部依赖，使用 Google Chart API 不可靠，改用 canvas 简易绘制密钥提示）
      // 这里直接显示密钥供手动输入；如需二维码可后续接入 qrcode 库
      $('totp-qr').style.display = 'none';
      $('totp-code-input').focus();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('totp-confirm-btn').addEventListener('click', async () => {
    const code = $('totp-code-input').value.trim();
    if (!code) {
      showToast('请输入验证器中的 6 位动态码', 'error');
      return;
    }
    try {
      await postJson('/api/auth/totp/confirm', { code });
      showToast('两步验证已启用', 'success');
      $('totp-enroll-row').style.display = 'none';
      $('totp-code-input').value = '';
      renderTotpStatus(true);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('totp-disable-btn').addEventListener('click', async () => {
    const code = $('totp-code-input').value.trim() || window.prompt('输入当前动态码以关闭两步验证');
    if (!code) {
      return;
    }
    try {
      await postJson('/api/auth/totp/disable', { code });
      showToast('两步验证已关闭', 'success');
      renderTotpStatus(false);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // ---- 通行密钥 ----

  async function loadPasskeys() {
    try {
      const data = await postJson('/api/auth/passkeys', undefined, { method: 'GET' });
      const list = data.passkeys || [];
      const row = $('passkey-list-row');
      row.style.display = list.length ? '' : 'none';
      const container = $('passkey-list');
      container.innerHTML = '';
      list.forEach((passkey) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;';
        const info = document.createElement('div');
        const name = document.createElement('div');
        name.textContent = passkey.name;
        name.style.fontWeight = '600';
        const meta = document.createElement('div');
        meta.textContent = `绑定于 ${new Date(passkey.createdAt).toLocaleString()}`;
        meta.style.cssText = 'font-size:12px;color:var(--text-muted);';
        info.append(name, meta);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-outline is-danger';
        removeBtn.textContent = '移除';
        removeBtn.addEventListener('click', async () => {
          if (!window.confirm(`确定移除通行密钥「${passkey.name}」？移除后将无法用它登录。`)) {
            return;
          }
          try {
            await postJson('/api/auth/passkeys', { credentialId: passkey.credentialId }, { method: 'DELETE' });
            showToast('通行密钥已移除', 'success');
            await loadPasskeys();
          } catch (error) {
            showToast(error.message, 'error');
          }
        });
        item.append(info, removeBtn);
        container.append(item);
      });
    } catch (error) {
      $('passkey-list-row').style.display = 'none';
    }
  }

  $('passkey-add-btn').addEventListener('click', async () => {
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('当前浏览器不支持通行密钥');
      }
      const { options } = await postJson('/api/auth/passkeys/begin');
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: b64ToBuffer(options.challenge),
          user: {
            ...options.user,
            id: b64ToBuffer(options.user.id)
          },
          excludeCredentials: (options.excludeCredentials || []).map((c) => ({
            ...c,
            id: b64ToBuffer(c.id)
          }))
        }
      });
      const serialized = {
        id: credential.id,
        rawId: credential.id,
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64(credential.response.clientDataJSON),
          attestationObject: bufferToB64(credential.response.attestationObject)
        }
      };
      const name = window.prompt('为这个通行密钥起个名字（例如：我的 iPhone）') || '';
      await postJson('/api/auth/passkeys/register', { credential: serialized, name });
      showToast('通行密钥已添加', 'success');
      await loadPasskeys();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        return; // 用户取消
      }
      showToast(error.message || '通行密钥添加失败', 'error');
    }
  });

  loadSecurityState();
}