export function createSystemRoutes({ store, coreManager, paths }) {
  const getNodeGroups = async () => {
    if (typeof coreManager.getNodeGroupsResolved === 'function') {
      return coreManager.getNodeGroupsResolved();
    }
    return coreManager.getSettingsSnapshot().nodeGroups || [];
  };

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
    'GET /api/system/rules': async () => {
      const settings = coreManager.getSettingsSnapshot();
      return {
        status: 200,
        body: {
          ok: true,
          routingItems: settings.routingItems || [],
          rules: settings.customRules || [],
          customRules: settings.customRules || [],
          rulesets: settings.rulesets || [],
          nodeGroups: await getNodeGroups(),
          builtinRulesets: coreManager.getBuiltinRulesets(),
          core: coreManager.getStatus()
        }
      };
    },
    'PUT /api/system/rules': async ({ body }) => {
      const hasRoutingItems = body && Array.isArray(body.routingItems);
      const hasLegacyRules = body && Array.isArray(body.rules);
      const hasCustomRules = body && Array.isArray(body.customRules);
      const hasRulesets = body && Array.isArray(body.rulesets);
      if (!body || (!hasRoutingItems && !hasLegacyRules && !hasCustomRules && !hasRulesets)) {
        return {
          status: 400,
          body: { ok: false, error: 'Invalid rules payload' }
        };
      }

      try {
        const result = await coreManager.updateSettings({
          ...(hasRoutingItems ? { routingItems: body.routingItems } : {}),
          ...(hasLegacyRules ? { customRules: body.rules } : {}),
          ...(hasCustomRules ? { customRules: body.customRules } : {}),
          ...(hasRulesets ? { rulesets: body.rulesets } : {})
        });
        return {
          status: 200,
          body: {
            ok: true,
            ...result,
            routingItems: coreManager.getSettingsSnapshot().routingItems || [],
            rules: coreManager.getSettingsSnapshot().customRules || [],
            customRules: coreManager.getSettingsSnapshot().customRules || [],
            rulesets: coreManager.getSettingsSnapshot().rulesets || [],
            nodeGroups: await getNodeGroups(),
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
