import {
  buildNodePayloadFromForm,
  createManualNodeFormState,
  extractAdvancedNodeFields,
  getNodeFormVisibility,
  normalizeNodeForForm,
  parseAdvancedNodeFields,
  validateNodeFormState,
} from './node-form-schema.js';

const FOCUS_TARGETS = ['name', 'server', 'uuid', 'password'];

const FIELD_VISIBILITY_MAP = {
  security: ['security'],
  transport: ['transport'],
  uuid: ['uuid'],
  password: ['password'],
  username: ['username'],
  method: ['method', 'plugin', 'plugin_opts'],
  version: ['version'],
  frontProxy: ['frontProxyNodeId'],
  alterId: ['alterId'],
  flow: ['flow'],
  packetEncoding: ['packet_encoding'],
  wsPath: ['wsPath'],
  wsHost: ['wsHost'],
  wsEarlyData: ['max_early_data', 'early_data_header_name'],
  grpcServiceName: ['serviceName'],
  sni: ['sni'],
  insecure: ['insecure'],
  alpn: ['alpn'],
  fp: ['fp'],
  reality: ['pbk', 'sid', 'spx'],
  tlsAdvanced: ['tls_min_version', 'tls_max_version', 'tls_cipher_suites', 'certificate_public_key_sha256'],
  shadowsocks: ['plugin', 'plugin_opts'],
  hysteria2: ['obfs', 'obfs_password', 'up_mbps', 'down_mbps'],
  tuic: ['congestion_control', 'udp_relay_mode'],
  heartbeat: ['heartbeat'],
  udpFlags: ['udp_over_stream', 'zero_rtt_handshake'],
  ip: ['ip'],
};

const getFieldElements = (nodeForm) => Object.fromEntries(
  Array.from(nodeForm.elements)
    .filter((element) => element.name)
    .map((element) => [element.name, element])
);

const getNodeDisplayName = (node) => node?.name || node?.server || node?.id || 'Node';

const renderFrontProxyOptions = ({ nodeForm, nodesData = [], currentEditNodeId = null }) => {
  const select = nodeForm?.elements?.frontProxyNodeId;
  if (!select) {
    return;
  }

  const currentValue = select.value;
  const candidates = (Array.isArray(nodesData) ? nodesData : [])
    .filter((node) => node?.id && node.id !== currentEditNodeId)
    .filter((node) => String(node.type || '').toLowerCase() !== 'socks');

  select.innerHTML = [
    '<option value="">直连 SOCKS5 服务器</option>',
    ...candidates.map((node) => {
      const option = document.createElement('option');
      option.value = node.id;
      option.textContent = `${getNodeDisplayName(node)} (${String(node.type || '').toUpperCase()})`;
      return option.outerHTML;
    })
  ].join('');

  select.value = candidates.some((node) => node.id === currentValue) ? currentValue : '';
};

const setFormValues = (nodeForm, formState) => {
  const fields = getFieldElements(nodeForm);
  Object.entries(formState).forEach(([key, value]) => {
    const field = fields[key];
    if (!field) {
      return;
    }
    if (field.type === 'checkbox') {
      field.checked = !!value;
      return;
    }
    field.value = value ?? '';
  });
};

const readFormValues = (nodeForm) => {
  const fields = getFieldElements(nodeForm);
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [
    name,
    field.type === 'checkbox' ? field.checked : field.value
  ]));
};

const getValidationWrapper = (nodeForm, name) => {
  if (name === 'advanced') {
    return nodeForm?.querySelector('[data-form-section="advanced"]');
  }
  return nodeForm?.querySelector(`[data-form-field="${name}"]`);
};

const getValidationControl = (nodeForm, name) => {
  if (name === 'advanced') {
    return nodeForm?.querySelector('#edit-node-advanced-input');
  }
  return nodeForm?.elements?.[name];
};

const clearNodeFormValidation = (nodeForm) => {
  if (!nodeForm) {
    return;
  }
  nodeForm.querySelectorAll('.node-form-field-wrap.has-error, .node-form-section.has-error').forEach((wrapper) => {
    wrapper.classList.remove('has-error');
  });
  nodeForm.querySelectorAll('.node-form-field-error').forEach((item) => item.remove());
  Array.from(nodeForm.elements || []).forEach((field) => {
    field.classList?.remove('has-error');
    field.removeAttribute?.('aria-invalid');
    field.removeAttribute?.('aria-describedby');
  });
};

export const applyNodeFormValidation = ({ nodeForm, errors = {} } = {}) => {
  clearNodeFormValidation(nodeForm);
  if (!nodeForm) {
    return;
  }

  Object.entries(errors).forEach(([name, message]) => {
    const wrapper = getValidationWrapper(nodeForm, name);
    const control = getValidationControl(nodeForm, name);
    if (!wrapper || !control) {
      return;
    }

    const errorId = `edit-node-${name}-error`;
    const errorEl = document.createElement('p');
    errorEl.className = 'node-form-field-error';
    errorEl.id = errorId;
    errorEl.textContent = message;

    wrapper.classList.add('has-error');
    control.classList?.add('has-error');
    control.setAttribute?.('aria-invalid', 'true');
    control.setAttribute?.('aria-describedby', errorId);
    wrapper.appendChild(errorEl);
  });
};

const validateVisibleNodeForm = ({ nodeForm, editAdvancedInput }) => {
  const formState = readFormValues(nodeForm);
  const validation = validateNodeFormState(formState, editAdvancedInput?.value);
  const visibleErrors = Object.fromEntries(Object.entries(validation.errors).filter(([name]) => {
    const wrapper = getValidationWrapper(nodeForm, name);
    return name === 'advanced' || (wrapper && !wrapper.classList.contains('hidden'));
  }));
  applyNodeFormValidation({ nodeForm, errors: visibleErrors });
  return {
    valid: Object.keys(visibleErrors).length === 0,
    errors: visibleErrors,
    formState
  };
};

const resetGroupInputState = (groupInput) => {
  if (!groupInput) {
    return;
  }
  groupInput.disabled = false;
  groupInput.title = '';
  groupInput.placeholder = '留空则归入未分组';
};

const lockSubscriptionGroupInput = (groupInput) => {
  if (!groupInput) {
    return;
  }
  groupInput.disabled = true;
  groupInput.title = '订阅节点固定在专属分组';
  groupInput.placeholder = '订阅节点固定在专属分组';
};

const updateFormSections = (nodeForm) => {
  nodeForm.querySelectorAll('[data-form-section]').forEach((section) => {
    if (section.dataset.formSection === 'advanced') {
      section.classList.remove('hidden');
      return;
    }
    const hasVisibleField = Array.from(section.querySelectorAll('[data-form-field]'))
      .some((field) => !field.classList.contains('hidden'));
    section.classList.toggle('hidden', !hasVisibleField);
  });
};

export const syncNodeFormRuntime = ({ nodeForm, editAdvancedInput, validate = false } = {}) => {
  if (!nodeForm) {
    return;
  }

  let state = readFormValues(nodeForm);
  if (state.type === 'vmess' && state.security === 'reality' && nodeForm.elements.security) {
    nodeForm.elements.security.value = 'none';
    state = readFormValues(nodeForm);
  }
  const visibility = getNodeFormVisibility(state);

  if (!visibility.security && nodeForm.elements.security) {
    nodeForm.elements.security.value = ['tuic', 'hysteria2'].includes(state.type) ? 'tls' : 'none';
  }
  if (!visibility.transport && nodeForm.elements.transport) {
    nodeForm.elements.transport.value = 'tcp';
  }

  Object.values(FIELD_VISIBILITY_MAP).flat().forEach((name) => {
    const wrapper = nodeForm.querySelector(`[data-form-field="${name}"]`);
    if (!wrapper) {
      return;
    }
    wrapper.classList.remove('hidden');
  });

  Object.entries(FIELD_VISIBILITY_MAP).forEach(([key, fieldNames]) => {
    const show = !!visibility[key];
    fieldNames.forEach((name) => {
      const wrapper = nodeForm.querySelector(`[data-form-field="${name}"]`);
      if (!wrapper) {
        return;
      }
      wrapper.classList.toggle('hidden', !show);
    });
  });

  updateFormSections(nodeForm);
  if (validate) {
    validateVisibleNodeForm({ nodeForm, editAdvancedInput });
  } else {
    clearNodeFormValidation(nodeForm);
  }
};

export const bindNodeFormRuntime = ({ nodeForm, editAdvancedInput }) => {
  if (!nodeForm || nodeForm.dataset.bound === '1') {
    return;
  }

  ['type', 'security', 'transport'].forEach((name) => {
    const field = nodeForm.elements[name];
    field?.addEventListener('change', () => {
      syncNodeFormRuntime({ nodeForm, editAdvancedInput, validate: nodeForm.dataset.validateOnInput === '1' });
    });
  });

  nodeForm.addEventListener('input', (event) => {
    if (nodeForm.dataset.validateOnInput !== '1') {
      return;
    }
    if (event.target?.name || event.target?.id === 'edit-node-advanced-input') {
      validateVisibleNodeForm({ nodeForm, editAdvancedInput });
    }
  });

  nodeForm.addEventListener('change', (event) => {
    if (nodeForm.dataset.validateOnInput !== '1') {
      return;
    }
    if (event.target?.name || event.target?.id === 'edit-node-advanced-input') {
      validateVisibleNodeForm({ nodeForm, editAdvancedInput });
    }
  });

  nodeForm.dataset.bound = '1';
  syncNodeFormRuntime({ nodeForm, editAdvancedInput });
};

const focusFirstField = (nodeForm) => {
  for (const name of FOCUS_TARGETS) {
    const field = nodeForm.elements[name];
    if (field && !field.disabled && !field.closest('.hidden')) {
      window.setTimeout(() => field.focus(), 30);
      return;
    }
  }
};

const setModalMode = ({ editModalTitle, saveNodeBtn, currentEditNodeId }) => {
  if (editModalTitle) {
    editModalTitle.textContent = currentEditNodeId ? '编辑节点' : '手动添加节点';
  }
  if (saveNodeBtn) {
    saveNodeBtn.textContent = currentEditNodeId ? '保存节点' : '添加节点';
  }
};

export const closeNodeEditModal = ({
  editModal,
  setCurrentEditNodeId,
  nodeForm,
  editAdvancedInput,
  editNodeGroupInput,
  editModalTitle,
  saveNodeBtn
}) => {
  if (nodeForm) {
    nodeForm.dataset.validateOnInput = '0';
    setFormValues(nodeForm, createManualNodeFormState(''));
    syncNodeFormRuntime({ nodeForm, editAdvancedInput });
  }
  if (editAdvancedInput) {
    editAdvancedInput.value = '{}';
  }
  if (editNodeGroupInput) {
    resetGroupInputState(editNodeGroupInput);
  }
  editModal?.classList.remove('active');
  setCurrentEditNodeId(null);
  setModalMode({ editModalTitle, saveNodeBtn, currentEditNodeId: null });
};

export const openNodeEditModal = ({
  id,
  nodesData,
  setCurrentEditNodeId,
  nodeForm,
  editNodeGroupInput,
  editAdvancedInput,
  editModal,
  editModalTitle,
  saveNodeBtn
}) => {
  const node = nodesData.find((item) => item.id === id);
  if (!node || !nodeForm) {
    return;
  }

  setCurrentEditNodeId(id);
  renderFrontProxyOptions({ nodeForm, nodesData, currentEditNodeId: id });
  setFormValues(nodeForm, normalizeNodeForForm(node));
  if (editAdvancedInput) {
    editAdvancedInput.value = JSON.stringify(extractAdvancedNodeFields(node), null, 2);
  }
  if (node.source === 'subscription') {
    lockSubscriptionGroupInput(editNodeGroupInput);
  } else {
    resetGroupInputState(editNodeGroupInput);
  }
  nodeForm.dataset.validateOnInput = '0';
  syncNodeFormRuntime({ nodeForm, editAdvancedInput });
  setModalMode({ editModalTitle, saveNodeBtn, currentEditNodeId: id });
  editModal?.classList.add('active');
  focusFirstField(nodeForm);
};

export const prepareManualNodeDraft = ({
  currentGroup,
  nodesData,
  setCurrentEditNodeId,
  nodeForm,
  editAdvancedInput,
  editNodeGroupInput,
  editModal,
  editModalTitle,
  saveNodeBtn
}) => {
  setCurrentEditNodeId(null);
  if (nodeForm) {
    renderFrontProxyOptions({ nodeForm, nodesData, currentEditNodeId: null });
    setFormValues(nodeForm, createManualNodeFormState(currentGroup));
    nodeForm.dataset.validateOnInput = '0';
    syncNodeFormRuntime({ nodeForm, editAdvancedInput });
  }
  if (editAdvancedInput) {
    editAdvancedInput.value = '{}';
  }
  resetGroupInputState(editNodeGroupInput);
  setModalMode({ editModalTitle, saveNodeBtn, currentEditNodeId: null });
  editModal?.classList.add('active');
  focusFirstField(nodeForm);
};

export const saveNodeEdit = async ({
  saveNodeBtn,
  nodeForm,
  editAdvancedInput,
  currentEditNodeId,
  requestJson,
  setNodesData,
  renderNodesElement,
  syncNodeMutationFeedback,
  closeModal,
  showToast
}) => {
  const idleLabel = currentEditNodeId ? '保存节点' : '添加节点';
  if (saveNodeBtn) {
    saveNodeBtn.textContent = currentEditNodeId ? '保存中...' : '添加中...';
    saveNodeBtn.disabled = true;
  }

  try {
    nodeForm.dataset.validateOnInput = '1';
    const validation = validateVisibleNodeForm({ nodeForm, editAdvancedInput });
    if (!validation.valid) {
      const firstInvalid = Object.keys(validation.errors)
        .map((name) => getValidationControl(nodeForm, name))
        .find((field) => field && !field.disabled && !field.closest('.hidden'));
      firstInvalid?.focus?.();
      showToast('请先修正表单里标红的字段', 'error');
      return;
    }

    const formState = validation.formState;
    const advancedFields = parseAdvancedNodeFields(editAdvancedInput?.value);
    const payloadBody = buildNodePayloadFromForm(formState, advancedFields);

    let path = '/api/nodes';
    let method = 'PUT';
    if (!currentEditNodeId) {
      path = '/api/nodes/raw';
      method = 'POST';
    } else {
      payloadBody.id = currentEditNodeId;
    }

    const payload = await requestJson(path, {
      method,
      body: JSON.stringify(payloadBody)
    });

    setNodesData(payload.nodes || []);
    renderNodesElement();
    syncNodeMutationFeedback(payload);
    closeModal();
    if (!payload.autoRestarted && !payload.applyPending) {
      showToast(currentEditNodeId ? '节点已更新' : '节点已添加', 'success');
    }
  } catch (error) {
    showToast(`保存失败: ${error.message}`, 'error');
  } finally {
    if (saveNodeBtn) {
      saveNodeBtn.textContent = idleLabel;
      saveNodeBtn.disabled = false;
    }
  }
};
