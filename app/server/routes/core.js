const json = (body, status = 200) => ({ status, body });

export function createCoreRoutes({ coreManager }) {
  return {
    'POST /api/core/start': async () => {
      try {
        const core = await coreManager.start();
        return json({ ok: true, core });
      } catch (error) {
        return json({ ok: false, error: error.message, core: coreManager.getStatus() }, 500);
      }
    },
    'POST /api/core/stop': async () => json({ ok: true, core: await coreManager.stop() }),
    'POST /api/core/restart': async () => {
      try {
        const core = await coreManager.restart();
        return json({ ok: true, core });
      } catch (error) {
        return json({ ok: false, error: error.message, core: coreManager.getStatus() }, 500);
      }
    },
    'GET /api/core/routing-hits': async () => {
      try {
        return json({ ok: true, hits: await coreManager.getRoutingHits(), core: coreManager.getStatus() });
      } catch (error) {
        return json({ ok: false, error: error.message, hits: [], core: coreManager.getStatus() }, 500);
      }
    }
  };
}
