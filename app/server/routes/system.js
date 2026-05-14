const unsupportedUwpLoopback = {
  supported: false,
  packageFamilyName: 'Microsoft.WindowsStore_8wekyb3d8bbwe',
  exempted: false,
  exemptions: [],
  lastError: null
};

export function createSystemRoutes({ store, coreManager, paths, uwpLoopbackManager }) {
  const getNodeGroups = async () => {
    if (typeof coreManager.getNodeGroupsResolved === 'function') {
      return coreManager.getNodeGroupsResolved();
    }
    return coreManager.getSettingsSnapshot().nodeGroups || [];
  };

  const refreshAutoStartState = async () => {
    if (typeof coreManager.refreshAutoStartState !== 'function') {
      return coreManager.getStatus?.().autoStart || null;
    }

    try {
      return await coreManager.refreshAutoStartState();
    } catch {
      return coreManager.getStatus?.().autoStart || null;
    }
  };

  const getUwpLoopbackStatus = async () => {
    if (!uwpLoopbackManager || typeof uwpLoopbackManager.getMicrosoftStoreStatus !== 'function') {
      return unsupportedUwpLoopback;
    }

    try {
      return await uwpLoopbackManager.getMicrosoftStoreStatus();
    } catch (error) {
      return {
        ...unsupportedUwpLoopback,
        supported: true,
        lastError: error.message
      };
    }
  };

  const getMicrosoftStorePackageFamilyName = async () => {
    if (!uwpLoopbackManager || typeof uwpLoopbackManager.resolveMicrosoftStorePackageFamilyName !== 'function') {
      return unsupportedUwpLoopback.packageFamilyName;
    }

    return uwpLoopbackManager.resolveMicrosoftStorePackageFamilyName();
  };

  return {
    'GET /api/system/status': async () => {
      const [systemProxy, , uwpLoopback] = await Promise.all([
        coreManager.refreshSystemProxyState(),
        refreshAutoStartState(),
        getUwpLoopbackStatus()
      ]);
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
          systemProxy,
          uwpLoopback
        }
      };
    },
    'GET /api/system/uwp-loopback': async () => {
      try {
        return {
          status: 200,
          body: {
            ok: true,
            uwpLoopback: await getUwpLoopbackStatus(),
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
    'POST /api/system/uwp-loopback/store/enable': async () => {
      try {
        if (!uwpLoopbackManager || typeof uwpLoopbackManager.addExemption !== 'function') {
          throw new Error('UWP loopback exemption is not available');
        }

        const packageFamilyName = await getMicrosoftStorePackageFamilyName();
        return {
          status: 200,
          body: {
            ok: true,
            uwpLoopback: await uwpLoopbackManager.addExemption(packageFamilyName),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, uwpLoopback: error.uwpLoopback || await getUwpLoopbackStatus().catch(() => unsupportedUwpLoopback), core: coreManager.getStatus() }
        };
      }
    },
    'POST /api/system/uwp-loopback/store/disable': async () => {
      try {
        if (!uwpLoopbackManager || typeof uwpLoopbackManager.removeExemption !== 'function') {
          throw new Error('UWP loopback exemption is not available');
        }

        const packageFamilyName = await getMicrosoftStorePackageFamilyName();
        return {
          status: 200,
          body: {
            ok: true,
            uwpLoopback: await uwpLoopbackManager.removeExemption(packageFamilyName),
            core: coreManager.getStatus()
          }
        };
      } catch (error) {
        return {
          status: error.status || 500,
          body: { ok: false, error: error.message, uwpLoopback: error.uwpLoopback || await getUwpLoopbackStatus().catch(() => unsupportedUwpLoopback), core: coreManager.getStatus() }
        };
      }
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
