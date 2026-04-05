export const bindViewLifecycle = ({
  navItems,
  views,
  startTrafficPolling,
  stopTrafficPolling,
  loadSystemStatus,
  loadRoutingRules,
  startRoutingStatusPolling,
  stopRoutingStatusPolling,
  loadNodeGroups,
  startNodeGroupAutoTest,
  stopNodeGroupAutoTest,
  runNodeGroupAutoBackfillIfNeeded,
  markRoutingHitsAsSeen,
  updateRoutingLogNavBadge,
}) => {
  navItems.forEach((button) => {
    button.addEventListener('click', () => {
      navItems.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');

      views.forEach((view) => view.classList.remove('active'));
      const targetId = button.getAttribute('data-target');
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add('active');

      if (targetId === 'dashboard-view') {
        startTrafficPolling();
        stopRoutingStatusPolling();
        stopNodeGroupAutoTest();
        return;
      }

      if (targetId === 'routing-view') {
        loadSystemStatus();
        loadRoutingRules(true);
        stopRoutingStatusPolling();
        stopNodeGroupAutoTest();
        stopTrafficPolling();
        return;
      }

      if (targetId === 'node-groups-view') {
        loadNodeGroups().then(() => {
          startNodeGroupAutoTest();
          runNodeGroupAutoBackfillIfNeeded();
        });
        stopRoutingStatusPolling();
        stopTrafficPolling();
        return;
      }

      if (targetId === 'routing-logs-view') {
        loadSystemStatus();
        startRoutingStatusPolling();
        stopNodeGroupAutoTest();
        stopTrafficPolling();
        markRoutingHitsAsSeen();
        updateRoutingLogNavBadge(false);
        return;
      }

      stopRoutingStatusPolling();
      stopNodeGroupAutoTest();
      stopTrafficPolling();
    });
  });
};
