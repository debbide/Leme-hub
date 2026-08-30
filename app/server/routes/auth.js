// 面板认证路由。仅在 server 模式生效；desktop 模式下 /api/auth/state
// 返回 enabled:false，其余 auth 接口一律 404，保持桌面端零配置体验。

export function createAuthRoutes({ authService }) {
  const requireAuth = (handler) => async ({ request, ...rest }) => {
    const user = authService.resolveUserFromRequest(request);
    if (!user) {
      return { status: 401, body: { ok: false, error: '未登录或会话已过期' } };
    }
    return handler({ request, user, ...rest });
  };

  return {
    // 公开：前端启动时探测认证状态（是否需要登录 / 首次设置）
    'GET /api/auth/state': async () => ({
      status: 200,
      body: { ok: true, ...authService.getState() }
    }),

    // 公开：首次设置（创建管理员账号并登录）
    'POST /api/auth/setup': async ({ body }) => {
      const result = authService.setup(body || {});
      return {
        status: 200,
        body: { ok: true, needsSetup: false },
        headers: { 'Set-Cookie': result.cookie }
      };
    },

    // 公开：账号密码登录（可能返回 TOTP 二步票据）
    'POST /api/auth/login': async ({ body, request }) => {
      const result = authService.login(body || {}, {
        remoteAddress: request.socket?.remoteAddress || ''
      });
      if (result.twoFactorRequired) {
        return { status: 200, body: { ok: true, twoFactor: { required: true, ticket: result.ticket } } };
      }
      return {
        status: 200,
        body: { ok: true, twoFactor: { required: false } },
        headers: { 'Set-Cookie': result.cookie }
      };
    },

    // 公开：TOTP 二步验证完成登录
    'POST /api/auth/totp/verify': async ({ body }) => {
      const result = authService.verifyTotpTicket(body || {});
      return {
        status: 200,
        body: { ok: true },
        headers: { 'Set-Cookie': result.cookie }
      };
    },

    // 公开：通行密钥登录 challenge
    'POST /api/auth/passkey/login/challenge': async () => {
      const options = await authService.beginPasskeyLogin();
      return { status: 200, body: { ok: true, options } };
    },

    // 公开：通行密钥登录验证
    'POST /api/auth/passkey/login/verify': async ({ body }) => {
      const result = await authService.finishPasskeyLogin(body?.credential);
      return {
        status: 200,
        body: { ok: true },
        headers: { 'Set-Cookie': result.cookie }
      };
    },

    // ---- 以下需要登录 ----

    'POST /api/auth/logout': async ({ request }) => ({
      status: 200,
      body: { ok: true },
      headers: { 'Set-Cookie': authService.logout(request) }
    }),

    'GET /api/auth/me': requireAuth(async ({ user }) => ({
      status: 200,
      body: {
        ok: true,
        user: {
          username: user.username,
          totpEnabled: Boolean(user.totpEnabled),
          createdAt: user.createdAt
        }
      }
    })),

    // 修改密码
    'POST /api/auth/password/change': requireAuth(async ({ user, body }) => {
      authService.changePassword(user, { currentPassword: body?.currentPassword, newPassword: body?.newPassword });
      return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': 'leme_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' } };
    }),

    // TOTP 两步验证管理
    'POST /api/auth/totp/begin': requireAuth(async ({ user }) => {
      const result = authService.beginTotpEnrollment(user);
      return { status: 200, body: { ok: true, ...result } };
    }),

    'POST /api/auth/totp/confirm': requireAuth(async ({ user, body }) => {
      authService.confirmTotpEnrollment(user, body?.code);
      return { status: 200, body: { ok: true } };
    }),

    'POST /api/auth/totp/disable': requireAuth(async ({ user, body }) => {
      authService.disableTotp(user, body?.code);
      return { status: 200, body: { ok: true } };
    }),

    // 通行密钥管理
    'GET /api/auth/passkeys': requireAuth(async ({ user }) => ({
      status: 200,
      body: { ok: true, passkeys: authService.listPasskeysForUser(user) }
    })),

    'POST /api/auth/passkeys/begin': requireAuth(async ({ user }) => {
      const options = await authService.beginPasskeyRegistration(user);
      return { status: 200, body: { ok: true, options } };
    }),

    'POST /api/auth/passkeys/register': requireAuth(async ({ user, body }) => {
      await authService.finishPasskeyRegistration(user, body?.credential, body?.name);
      return { status: 200, body: { ok: true } };
    }),

    'DELETE /api/auth/passkeys': requireAuth(async ({ user, body }) => {
      authService.removePasskey(user, body?.credentialId);
      return { status: 200, body: { ok: true } };
    })
  };
}
