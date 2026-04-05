export const bindNodesPanelEvents = ({
  showImportBtn,
  importForm,
  syncForm,
  importUrlInput,
  testAllBtn,
  testAllNodes,
  selectedNodeIds,
  showConfirmModal,
  requestJson,
  loadNodes,
  showToast,
  renderNodesElement,
  updateBulkBar,
  setNodeSearchQuery,
  getActiveGroupTab,
  resetActiveGroup,
  renderGroupTabs,
  showSyncBtn,
  syncUrlInput,
  manualAddBtn,
  prepareManualNodeDraft,
  closePanelBtn,
  importLink,
  syncSub,
}) => {
  showImportBtn?.addEventListener('click', () => {
    importForm.classList.toggle('hidden');
    syncForm.classList.add('hidden');
    if (!importForm.classList.contains('hidden')) importUrlInput.focus();
  });

  testAllBtn?.addEventListener('click', testAllNodes);

  document.getElementById('bulk-move-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = document.getElementById('bulk-group-menu');
    if (menu) menu.classList.toggle('open');
  });

  document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
    if (!selectedNodeIds.size) return;
    if (!await showConfirmModal(`删除 ${selectedNodeIds.size} 个节点`, '此操作不可撤销，确认删除所选节点？')) return;
    try {
      await Promise.all([...selectedNodeIds].map((id) =>
        requestJson('/api/nodes', { method: 'DELETE', body: JSON.stringify({ id }) })
      ));
      selectedNodeIds.clear();
      await loadNodes();
      showToast('批量删除完成', 'success');
    } catch (error) {
      showToast(`删除失败: ${error.message}`, 'error');
    }
  });

  document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
    selectedNodeIds.clear();
    renderNodesElement();
    updateBulkBar();
  });

  const nodeSearchInput = document.querySelector('#node-search');
  nodeSearchInput?.addEventListener('input', (event) => {
    const value = event.target.value.trim();
    setNodeSearchQuery(value);
    if (value && getActiveGroupTab() !== null) {
      resetActiveGroup();
      renderGroupTabs();
    }
    renderNodesElement();
  });

  showSyncBtn?.addEventListener('click', () => {
    syncForm.classList.toggle('hidden');
    importForm.classList.add('hidden');
    if (!syncForm.classList.contains('hidden')) syncUrlInput.focus();
  });

  manualAddBtn?.addEventListener('click', prepareManualNodeDraft);

  closePanelBtn?.addEventListener('click', () => {
    window.close();
    showToast('即将关闭面板...', 'info');
  });

  document.querySelectorAll('.cancel-btn').forEach((button) => {
    button.addEventListener('click', () => {
      importForm.classList.add('hidden');
      syncForm.classList.add('hidden');
    });
  });

  importForm?.addEventListener('submit', importLink);
  syncForm?.addEventListener('submit', syncSub);
};
