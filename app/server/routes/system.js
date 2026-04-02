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
          rulesetDatabase: coreManager.getRulesetDatabaseStatus(),
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
    'POST /api/system/rulesets/refresh': async () => {
      try {
        return {
          status: 200,
          body: {
            ok: true,
            rulesetDatabase: await coreManager.refreshRulesetDatabase(),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, rulesetDatabase: coreManager.getRulesetDatabaseStatus(), core: coreManager.getStatus() }
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
        customRules: coreManager.getSettingsSnapshot().customRules || [],
        rulesets: coreManager.getSettingsSnapshot().rulesets || [],
        builtinRulesets: coreManager.getBuiltinRulesets(),
        core: coreManager.getStatus()
      }
    }),
    'PUT /api/system/rules': async ({ body }) => {
      const hasLegacyRules = body && Array.isArray(body.rules);
      const hasCustomRules = body && Array.isArray(body.customRules);
      const hasRulesets = body && Array.isArray(body.rulesets);
      if (!body || (!hasLegacyRules && !hasCustomRules && !hasRulesets)) {
        return {
          status: 400,
          body: { ok: false, error: 'Invalid rules payload' }
        };
      }

      try {
        const result = await coreManager.updateSettings({
          ...(hasLegacyRules ? { customRules: body.rules } : {}),
          ...(hasCustomRules ? { customRules: body.customRules } : {}),
          ...(hasRulesets ? { rulesets: body.rulesets } : {})
        });
        return {
          status: 200,
          body: {
            ok: true,
            ...result,
            rules: coreManager.getSettingsSnapshot().customRules || [],
            customRules: coreManager.getSettingsSnapshot().customRules || [],
            rulesets: coreManager.getSettingsSnapshot().rulesets || [],
            builtinRulesets: coreManager.getBuiltinRulesets(),
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
