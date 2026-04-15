const resetGroupInputState = (editNodeGroupInput) => {
  if (!editNodeGroupInput) {
    return;
  }

  editNodeGroupInput.disabled = false;
  editNodeGroupInput.title = '';
  editNodeGroupInput.placeholder = '留空则归入未分组';
};

export const closeNodeEditModal = ({ editModal, setCurrentEditNodeId, editJsonInput, editNodeGroupInput, editCountryOverrideInput }) => {
  editModal.classList.remove('active');
  setCurrentEditNodeId(null);
  editJsonInput.value = '';
  if (editNodeGroupInput) {
    editNodeGroupInput.value = '';
    resetGroupInputState(editNodeGroupInput);
  }
  if (editCountryOverrideInput) editCountryOverrideInput.value = '';
};

export const openNodeEditModal = ({ id, nodesData, setCurrentEditNodeId, editNodeGroupInput, editCountryOverrideInput, editJsonInput, editModal }) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node) return;
  setCurrentEditNodeId(id);
  const editData = { ...node };
  delete editData.countryCode;
  delete editData.countryName;
  delete editData.flagEmoji;
  delete editData.countryOverridden;

  if (editNodeGroupInput) {
    editNodeGroupInput.value = node.group || '';
    if (node.source === 'subscription') {
      editNodeGroupInput.disabled = true;
      editNodeGroupInput.title = '订阅节点固定在专属分组';
      editNodeGroupInput.placeholder = '订阅节点固定在专属分组';
    } else {
      resetGroupInputState(editNodeGroupInput);
    }
  }

  if (editCountryOverrideInput) editCountryOverrideInput.value = node.countryCodeOverride || '';
  editJsonInput.value = JSON.stringify(editData, null, 2);
  editModal.classList.add('active');
};

export const prepareManualNodeDraft = ({ currentGroup, setCurrentEditNodeId, editJsonInput, editNodeGroupInput, editCountryOverrideInput, editModal }) => {
  setCurrentEditNodeId(null);
  const skeleton = {
    type: 'vless',
    server: '',
    port: 443,
    uuid: '',
    transport: 'tcp',
    security: 'none'
  };
  editJsonInput.value = JSON.stringify(skeleton, null, 2);
  if (editNodeGroupInput) {
    editNodeGroupInput.value = currentGroup || '';
    resetGroupInputState(editNodeGroupInput);
  }
  if (editCountryOverrideInput) editCountryOverrideInput.value = '';
  editModal.classList.add('active');
};

export const saveNodeEdit = async ({ saveNodeBtn, editJsonInput, editNodeGroupInput, editCountryOverrideInput, currentEditNodeId, requestJson, setNodesData, renderNodesElement, syncNodeMutationFeedback, closeModal, showToast }) => {
  saveNodeBtn.textContent = '保存中...';
  saveNodeBtn.disabled = true;
  try {
    const updatedData = JSON.parse(editJsonInput.value);
    const groupValue = editNodeGroupInput ? editNodeGroupInput.value.trim() || null : undefined;
    const countryOverrideValue = editCountryOverrideInput ? editCountryOverrideInput.value.trim().toUpperCase() : '';
    if (countryOverrideValue && !/^[A-Z]{2}$/u.test(countryOverrideValue)) {
      throw new Error('国家代码格式错误，请填写 2 位字母，例如 JP / US');
    }
    if (groupValue !== undefined) updatedData.group = groupValue;
    if (editCountryOverrideInput) updatedData.countryCodeOverride = countryOverrideValue || null;

    let path = '/api/nodes';
    let method = 'PUT';
    if (!currentEditNodeId) {
      path = '/api/nodes/raw';
      method = 'POST';
    } else {
      updatedData.id = currentEditNodeId;
    }

    const payload = await requestJson(path, {
      method,
      body: JSON.stringify(updatedData)
    });

    setNodesData(payload.nodes || []);
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    closeModal();
    if (!payload.autoRestarted) {
      showToast(currentEditNodeId ? '节点配置已更新' : '节点已手动添加', 'success');
    }
  } catch (error) {
    showToast(`保存失败: ${error.message}`, 'error');
  } finally {
    saveNodeBtn.textContent = '保存设置';
    saveNodeBtn.disabled = false;
  }
};
