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

export const ROUTING_MODES = ['rule', 'global', 'direct'];
export const CUSTOM_RULE_TYPES = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr'];
export const CUSTOM_RULE_ACTIONS = ['default', 'direct', 'node'];
export const RULESET_KINDS = ['builtin', 'custom'];
export const RULESET_TARGETS = ['default', 'direct', 'node'];

export const BUILTIN_RULESETS = [
  {
    id: 'ai-services',
    name: 'AI 服务',
    entries: [
      { type: 'domain_keyword', value: 'openai' },
      { type: 'domain_keyword', value: 'anthropic' },
      { type: 'domain_suffix', value: 'claude.ai' },
      { type: 'domain_suffix', value: 'midjourney.com' }
    ]
  },
  {
    id: 'youtube',
    name: 'YouTube 视频',
    entries: [
      { type: 'domain_keyword', value: 'youtube' },
      { type: 'domain_suffix', value: 'youtube.com' },
      { type: 'domain_suffix', value: 'googlevideo.com' },
      { type: 'domain_suffix', value: 'youtu.be' }
    ]
  },
  {
    id: 'google',
    name: 'Google 服务',
    entries: [
      { type: 'domain_keyword', value: 'google' },
      { type: 'domain_suffix', value: 'google.com' },
      { type: 'domain_suffix', value: 'gstatic.com' }
    ]
  },
  {
    id: 'github',
    name: 'GitHub 开发',
    entries: [
      { type: 'domain_keyword', value: 'github' },
      { type: 'domain_suffix', value: 'github.com' },
      { type: 'domain_suffix', value: 'githubusercontent.com' }
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram 通讯',
    entries: [
      { type: 'domain_keyword', value: 'telegram' },
      { type: 'domain_suffix', value: 't.me' },
      { type: 'domain_suffix', value: 'telegram.org' }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok 短视频',
    entries: [
      { type: 'domain_keyword', value: 'tiktok' },
      { type: 'domain_suffix', value: 'tiktok.com' },
      { type: 'domain_suffix', value: 'byteoversea.com' }
    ]
  },
  {
    id: 'netflix',
    name: 'Netflix 流媒体',
    entries: [
      { type: 'domain_keyword', value: 'netflix' },
      { type: 'domain_suffix', value: 'netflix.com' },
      { type: 'domain_suffix', value: 'nflxvideo.net' }
    ]
  },
  {
    id: 'paypal',
    name: 'PayPal 支付',
    entries: [
      { type: 'domain_keyword', value: 'paypal' },
      { type: 'domain_suffix', value: 'paypal.com' }
    ]
  },
  {
    id: 'steam',
    name: 'Steam 游戏',
    entries: [
      { type: 'domain_keyword', value: 'steam' },
      { type: 'domain_suffix', value: 'steampowered.com' },
      { type: 'domain_suffix', value: 'steamcommunity.com' }
    ]
  },
  {
    id: 'microsoft',
    name: 'Microsoft 服务',
    entries: [
      { type: 'domain_keyword', value: 'microsoft' },
      { type: 'domain_suffix', value: 'microsoft.com' },
      { type: 'domain_suffix', value: 'live.com' }
    ]
  },
  {
    id: 'onedrive',
    name: 'OneDrive 网盘',
    entries: [
      { type: 'domain_keyword', value: 'onedrive' },
      { type: 'domain_suffix', value: 'onedrive.live.com' },
      { type: 'domain_suffix', value: '1drv.com' }
    ]
  },
  {
    id: 'apple',
    name: 'Apple 服务',
    entries: [
      { type: 'domain_keyword', value: 'apple' },
      { type: 'domain_suffix', value: 'apple.com' },
      { type: 'domain_suffix', value: 'icloud.com' }
    ]
  },
  {
    id: 'foreign-sites',
    name: '常见国外站点',
    entries: [
      { type: 'domain_suffix', value: 'com' },
      { type: 'domain_suffix', value: 'net' },
      { type: 'domain_suffix', value: 'org' }
    ]
  },
  {
    id: 'cn-domains',
    name: '国内常见域名',
    entries: [
      { type: 'domain_suffix', value: 'cn' },
      { type: 'domain_keyword', value: 'baidu' },
      { type: 'domain_keyword', value: 'taobao' },
      { type: 'domain_keyword', value: 'qq' }
    ]
  }
];
