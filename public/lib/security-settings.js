// 安全设置模块：设置页「账号安全」入口 → 弹窗验证当前密码 → 管理 TOTP / Passkey / 修改密码。
// 仅在 server 模式（auth enabled）且已登录时显示入口；desktop 模式整块隐藏。

import { renderQrCodeToCanvas } from './qr-code.js';

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
  const entry = $('security-card');
  if (!entry) {
    return;
  }

  const modal = $('security-modal');
  const verifyStep = $('security-verify-step');
  const manageStep = $('security-manage-step');
  const verifyInput = $('security-verify-input');
  const verifyError = $('security-verify-error');

  const hideEntry = () => { entry.style.display = 'none'; };

  // 验证通过后暂存密码，供「修改密码」接口使用（不落盘，仅本次会话内存）
  let lastVerifiedPassword = '';

  // ---- 入口可见性（server 模式 + 已登录）----

  async function loadSecurityState() {
    try {
      const state = await postJson('/api/auth/state', undefined, { method: 'GET' });
      if (!state.enabled) {
        hideEntry();
        return;
      }
      const me = await postJson('/api/auth/me', undefined, { method: 'GET' });
      entry.style.display = '';
      const note = $('security-account-note');
      if (note) {
        note.textContent = `当前账号：${me.user.username} · 修改密码、两步验证与通行密钥管理`;
      }
    } catch (error) {
      hideEntry();
    }
  }

  // ---- 弹窗开关 ----

  function openModal() {
    if (!modal) {
      return;
    }
    // 每次打开都从密码验证开始
    if (verifyStep) {
      verifyStep.style.display = '';
    }
    if (manageStep) {
      manageStep.style.display = 'none';
    }
    if (verifyInput) {
      verifyInput.value = '';
      verifyInput.focus();
    }
    if (verifyError) {
      verifyError.textContent = '';
    }
    modal.classList.add('active');
  }

  function closeModal() {
    if (!modal) {
      return;
    }
    modal.classList.remove('active');
    hideTotpEnroll();
  }

  $('security-manage-btn')?.addEventListener('click', openModal);
  $('security-modal-close')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('active')) {
      closeModal();
    }
  });

  // ---- 第一步：验证当前密码 ----

  async function verifyPassword() {
    const password = verifyInput?.value || '';
    if (!password) {
      if (verifyError) {
        verifyError.textContent = '请输入当前密码';
      }
      return;
    }
    const btn = $('security-verify-btn');
    if (btn) {
      btn.disabled = true;
    }
    try {
      await postJson('/api/auth/verify-password', { password });
      lastVerifiedPassword = password;
      if (verifyError) {
        verifyError.textContent = '';
      }
      if (verifyInput) {
        verifyInput.value = '';
      }
      if (verifyStep) {
        verifyStep.style.display = 'none';
      }
      if (manageStep) {
        manageStep.style.display = '';
      }
      await refreshManageState();
    } catch (error) {
      if (verifyError) {
        verifyError.textContent = error.message;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  }

  $('security-verify-btn')?.addEventListener('click', verifyPassword);
  verifyInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      verifyPassword();
    }
  });

  // ---- 第二步：加载管理状态 ----

  async function refreshManageState() {
    try {
      const me = await postJson('/api/auth/me', undefined, { method: 'GET' });
      renderTotpStatus(me.user.totpEnabled);
      await loadPasskeys();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function renderTotpStatus(enabled) {
    const status = $('totp-status');
    if (status) {
      status.textContent = enabled ? '已启用' : '未启用';
      status.style.color = enabled ? 'var(--accent-green)' : 'var(--text-muted)';
    }
    const enableBtn = $('totp-enable-btn');
    const disableBtn = $('totp-disable-btn');
    if (enableBtn) {
      enableBtn.style.display = enabled ? 'none' : '';
    }
    if (disableBtn) {
      disableBtn.style.display = enabled ? '' : 'none';
    }
    if (!enabled) {
      hideTotpEnroll();
    }
  }

  function hideTotpEnroll() {
    const area = $('totp-enroll-area');
    if (area) {
      area.style.display = 'none';
    }
  }

  // ---- 修改密码 ----

  $('pwd-change-btn')?.addEventListener('click', async () => {
    const next = $('pwd-new')?.value || '';
    const confirm = $('pwd-confirm')?.value || '';
    if (!next) {
      showToast('请输入新密码', 'error');
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
    const btn = $('pwd-change-btn');
    btn.disabled = true;
    try {
      await postJson('/api/auth/password/change', { currentPassword: lastVerifiedPassword, newPassword: next });
      showToast('密码已修改，所有会话已失效，即将跳转登录页', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- TOTP ----

  let totpEnrollUri = '';

  $('totp-enable-btn')?.addEventListener('click', async () => {
    const btn = $('totp-enable-btn');
    btn.disabled = true;
    try {
      const data = await postJson('/api/auth/totp/begin');
      totpEnrollUri = data.uri || '';
      const secretText = $('totp-secret-text');
      if (secretText) {
        secretText.textContent = data.secret || '';
      }
      const area = $('totp-enroll-area');
      if (area) {
        area.style.display = '';
      }
      const canvas = $('totp-qr-canvas');
      if (canvas && totpEnrollUri) {
        try {
          renderQrCodeToCanvas(canvas, totpEnrollUri, { scale: 4, margin: 2 });
        } catch (qrError) {
          // 二维码渲染失败时仍可手动输入密钥
        }
      }
      const codeInput = $('totp-code-input');
      if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('totp-copy-btn')?.addEventListener('click', async () => {
    const secret = $('totp-secret-text')?.textContent || '';
    if (!secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      showToast('密钥已复制', 'success');
    } catch (error) {
      showToast('复制失败，请手动选择复制', 'error');
    }
  });

  $('totp-confirm-btn')?.addEventListener('click', async () => {
    const code = $('totp-code-input')?.value.trim() || '';
    if (!code) {
      showToast('请输入验证器中的 6 位动态码', 'error');
      return;
    }
    const btn = $('totp-confirm-btn');
    btn.disabled = true;
    try {
      await postJson('/api/auth/totp/confirm', { code });
      showToast('两步验证已启用', 'success');
      hideTotpEnroll();
      const codeInput = $('totp-code-input');
      if (codeInput) {
        codeInput.value = '';
      }
      renderTotpStatus(true);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('totp-disable-btn')?.addEventListener('click', async () => {
    const code = window.prompt('输入当前动态码以关闭两步验证');
    if (!code) {
      return;
    }
    const btn = $('totp-disable-btn');
    btn.disabled = true;
    try {
      await postJson('/api/auth/totp/disable', { code });
      showToast('两步验证已关闭', 'success');
      renderTotpStatus(false);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- 通行密钥 ----

  async function loadPasskeys() {
    const container = $('passkey-list');
    if (!container) {
      return;
    }
    try {
      const data = await postJson('/api/auth/passkeys', undefined, { method: 'GET' });
      const list = data.passkeys || [];
      container.innerHTML = '';
      if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'security-hint';
        empty.textContent = '尚未绑定通行密钥';
        container.append(empty);
        return;
      }
      list.forEach((passkey) => {
        const item = document.createElement('div');
        item.className = 'passkey-item';
        const info = document.createElement('div');
        const name = document.createElement('div');
        name.textContent = passkey.name || '未命名密钥';
        name.style.fontWeight = '600';
        const meta = document.createElement('div');
        meta.className = 'passkey-item-meta';
        meta.textContent = `绑定于 ${new Date(passkey.createdAt).toLocaleString()}`;
        info.append(name, meta);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-outline is-danger';
        removeBtn.textContent = '移除';
        removeBtn.addEventListener('click', async () => {
          if (!window.confirm(`确定移除通行密钥「${passkey.name}」？移除后将无法用它登录。`)) {
            return;
          }
          removeBtn.disabled = true;
          try {
            await postJson('/api/auth/passkeys', { credentialId: passkey.credentialId }, { method: 'DELETE' });
            showToast('通行密钥已移除', 'success');
            await loadPasskeys();
          } catch (error) {
            removeBtn.disabled = false;
            showToast(error.message, 'error');
          }
        });
        item.append(info, removeBtn);
        container.append(item);
      });
    } catch (error) {
      container.innerHTML = '';
    }
  }

  $('passkey-add-btn')?.addEventListener('click', async () => {
    const btn = $('passkey-add-btn');
    btn.disabled = true;
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
    } finally {
      btn.disabled = false;
    }
  });

  loadSecurityState();
}