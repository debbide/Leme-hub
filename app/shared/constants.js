export const DEFAULT_UI_HOST = '0.0.0.0';
export const DEFAULT_UI_PORT = 51888;
export const DEFAULT_PROXY_LISTEN_HOST = '127.0.0.1';
export const DEFAULT_PROXY_BASE_PORT = 20000;
export const DEFAULT_SYSTEM_PROXY_SOCKS_PORT = 20100;
export const DEFAULT_SYSTEM_PROXY_HTTP_PORT = 20101;
export const DEFAULT_CONFIG_FILE = 'singbox_config.json';
export const DEFAULT_LOG_FILE = 'singbox.log';
export const DEFAULT_NODES_FILE = 'proxy_nodes.json';
export const DEFAULT_SETTINGS_FILE = 'settings.json';
export const DEFAULT_MANAGED_SINGBOX_VERSION = '1.13.4';
export const SINGBOX_REPOSITORY = {
  owner: 'SagerNet',
  repo: 'sing-box'
};

export const ROUTING_MODES = ['rule', 'global', 'direct', 'custom'];
export const CUSTOM_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
export const CUSTOM_RULE_ACTIONS = ['proxy', 'direct'];
