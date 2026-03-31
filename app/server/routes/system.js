export function createSystemRoutes({ store, coreManager, paths }) {
  return {
    'GET /api/system/status': async () => {
      const systemProxy = await coreManager.refreshSystemProxyState();
      return {
        status: 200,
        body: {
          ok: true,
          backend: {
            root: paths.root,
            publicDir: paths.publicDir,
            dataDir: paths.dataDir,
            logsDir: paths.logsDir
          },
          settings: coreManager.getSettingsSnapshot(),
          core: coreManager.getStatus(),
          geoIp: coreManager.getGeoIpStatus(),
          systemProxy
        }
      };
    },
    'POST /api/system/geoip/refresh': async () => {
      try {
        return {
          status: 200,
          body: {
            ok: true,
            geoIp: await coreManager.refreshGeoIp(),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, geoIp: coreManager.getGeoIpStatus(), core: coreManager.getStatus() }
        };
      }
    },
    'PUT /api/system/settings': async ({ body }) => {
      if (!body || typeof body !== 'object') {
        return {
          status: 400,
          body: { ok: false, error: 'Invalid settings payload' }
        };
      }

      try {
        const result = await coreManager.updateSettings(body);
        return {
          status: 200,
          body: { ok: true, ...result, core: coreManager.getStatus() }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message }
        };
      }
    },
    'GET /api/system/rules': async () => ({
      status: 200,
      body: {
        ok: true,
        rules: coreManager.getSettingsSnapshot().customRules || [],
        core: coreManager.getStatus()
      }
    }),
    'PUT /api/system/rules': async ({ body }) => {
      if (!body || !Array.isArray(body.rules)) {
        return {
          status: 400,
          body: { ok: false, error: 'Invalid rules payload' }
        };
      }

      try {
        const result = await coreManager.updateSettings({ customRules: body.rules });
        return {
          status: 200,
          body: {
            ok: true,
            ...result,
            rules: coreManager.getSettingsSnapshot().customRules || [],
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, core: coreManager.getStatus() }
        };
      }
    },
    'GET /api/system/proxy/status': async () => ({
      status: 200,
      body: {
        ok: true,
        systemProxy: await coreManager.refreshSystemProxyState(),
        core: coreManager.getStatus()
      }
    }),
    'POST /api/system/proxy/apply': async () => {
      try {
        return {
          status: 200,
          body: {
            ok: true,
            systemProxy: await coreManager.applySystemProxy(),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, core: coreManager.getStatus() }
        };
      }
    },
    'POST /api/system/proxy/disable': async () => {
      try {
        return {
          status: 200,
          body: {
            ok: true,
            systemProxy: await coreManager.disableSystemProxy(),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, core: coreManager.getStatus() }
        };
      }
    }
  };
}
