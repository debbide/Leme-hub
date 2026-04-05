export const DEFAULT_UI_HOST = '0.0.0.0';
export const DEFAULT_UI_PORT = 51888;
export const DEFAULT_PROXY_LISTEN_HOST = '127.0.0.1';
export const DEFAULT_PROXY_BASE_PORT = 20000;
export const DEFAULT_SYSTEM_PROXY_SOCKS_PORT = 18998;
export const DEFAULT_SYSTEM_PROXY_HTTP_PORT = 18999;
export const DEFAULT_DNS_REMOTE_SERVER = 'https://cloudflare-dns.com/dns-query';
export const DEFAULT_DNS_DIRECT_SERVER = 'https://dns.alidns.com/dns-query';
export const DEFAULT_DNS_BOOTSTRAP_SERVER = '223.5.5.5';
export const DEFAULT_DNS_FINAL = 'dns-remote';
export const DEFAULT_DNS_STRATEGY = 'prefer_ipv4';
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
export const CUSTOM_RULE_ACTIONS = ['default', 'direct', 'node', 'node_group'];
export const RULESET_KINDS = ['builtin', 'custom'];
export const RULESET_TARGETS = ['default', 'direct', 'node', 'node_group'];

export const REMOTE_RULESET_CATALOG = [
  {
    id: 'geosite-fakeipfilter',
    tag: 'geosite-fakeipfilter',
    format: 'source',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/qichiyuhub/rule/refs/heads/main/rules/fakeipfilter.json'
  },
  {
    id: 'geosite-ai',
    tag: 'geosite-ai',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/category-ai-!cn.srs'
  },
  {
    id: 'geosite-youtube',
    tag: 'geosite-youtube',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs'
  },
  {
    id: 'geosite-google',
    tag: 'geosite-google',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs'
  },
  {
    id: 'geosite-github',
    tag: 'geosite-github',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/github.srs'
  },
  {
    id: 'geosite-onedrive',
    tag: 'geosite-onedrive',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/onedrive.srs'
  },
  {
    id: 'geosite-microsoft',
    tag: 'geosite-microsoft',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/microsoft.srs'
  },
  {
    id: 'geosite-apple',
    tag: 'geosite-apple',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/apple.srs'
  },
  {
    id: 'geosite-telegram',
    tag: 'geosite-telegram',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/telegram.srs'
  },
  {
    id: 'geosite-tiktok',
    tag: 'geosite-tiktok',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/tiktok.srs'
  },
  {
    id: 'geosite-netflix',
    tag: 'geosite-netflix',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs'
  },
  {
    id: 'geosite-paypal',
    tag: 'geosite-paypal',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/paypal.srs'
  },
  {
    id: 'geosite-steamcn',
    tag: 'geosite-steamcn',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/steam@cn.srs'
  },
  {
    id: 'geosite-steam',
    tag: 'geosite-steam',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/steam.srs'
  },
  {
    id: 'geosite-!cn',
    tag: 'geosite-!cn',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/geolocation-!cn.srs'
  },
  {
    id: 'geosite-cn',
    tag: 'geosite-cn',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/cn.srs'
  },
  {
    id: 'geoip-google',
    tag: 'geoip-google',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/google.srs'
  },
  {
    id: 'geoip-apple',
    tag: 'geoip-apple',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geoip/apple.srs'
  },
  {
    id: 'geoip-telegram',
    tag: 'geoip-telegram',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/telegram.srs'
  },
  {
    id: 'geoip-netflix',
    tag: 'geoip-netflix',
    format: 'binary',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/netflix.srs'
  },
  {
    id: 'geoip-cn',
    tag: 'geoip-cn',
    format: 'binary',
    url: 'https://gh-proxy.com/https://github.com/qljsyph/ruleset-icon/raw/refs/heads/main/sing-box/geoip/China-ASN-combined-ip.srs'
  }
];

export const BUILTIN_RULESETS = [
  {
    id: 'ai-services',
    name: 'AI 服务',
    remoteRuleSetIds: ['geosite-ai'],
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
    remoteRuleSetIds: ['geosite-youtube'],
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
    remoteRuleSetIds: ['geosite-google', 'geoip-google'],
    entries: [
      { type: 'domain_keyword', value: 'google' },
      { type: 'domain_suffix', value: 'google.com' },
      { type: 'domain_suffix', value: 'gstatic.com' }
    ]
  },
  {
    id: 'github',
    name: 'GitHub 开发',
    remoteRuleSetIds: ['geosite-github'],
    entries: [
      { type: 'domain_keyword', value: 'github' },
      { type: 'domain_suffix', value: 'github.com' },
      { type: 'domain_suffix', value: 'githubusercontent.com' }
    ]
  },
  {
    id: 'telegram',
    name: 'Telegram 通讯',
    remoteRuleSetIds: ['geosite-telegram', 'geoip-telegram'],
    entries: [
      { type: 'domain_keyword', value: 'telegram' },
      { type: 'domain_suffix', value: 't.me' },
      { type: 'domain_suffix', value: 'telegram.org' }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok 短视频',
    remoteRuleSetIds: ['geosite-tiktok'],
    entries: [
      { type: 'domain_keyword', value: 'tiktok' },
      { type: 'domain_suffix', value: 'tiktok.com' },
      { type: 'domain_suffix', value: 'byteoversea.com' }
    ]
  },
  {
    id: 'netflix',
    name: 'Netflix 流媒体',
    remoteRuleSetIds: ['geosite-netflix', 'geoip-netflix'],
    entries: [
      { type: 'domain_keyword', value: 'netflix' },
      { type: 'domain_suffix', value: 'netflix.com' },
      { type: 'domain_suffix', value: 'nflxvideo.net' }
    ]
  },
  {
    id: 'paypal',
    name: 'PayPal 支付',
    remoteRuleSetIds: ['geosite-paypal'],
    entries: [
      { type: 'domain_keyword', value: 'paypal' },
      { type: 'domain_suffix', value: 'paypal.com' }
    ]
  },
  {
    id: 'steam',
    name: 'Steam 游戏',
    remoteRuleSetIds: ['geosite-steam', 'geosite-steamcn'],
    entries: [
      { type: 'domain_keyword', value: 'steam' },
      { type: 'domain_suffix', value: 'steampowered.com' },
      { type: 'domain_suffix', value: 'steamcommunity.com' }
    ]
  },
  {
    id: 'microsoft',
    name: 'Microsoft 服务',
    remoteRuleSetIds: ['geosite-microsoft'],
    entries: [
      { type: 'domain_keyword', value: 'microsoft' },
      { type: 'domain_suffix', value: 'microsoft.com' },
      { type: 'domain_suffix', value: 'live.com' }
    ]
  },
  {
    id: 'onedrive',
    name: 'OneDrive 网盘',
    remoteRuleSetIds: ['geosite-onedrive'],
    entries: [
      { type: 'domain_keyword', value: 'onedrive' },
      { type: 'domain_suffix', value: 'onedrive.live.com' },
      { type: 'domain_suffix', value: '1drv.com' }
    ]
  },
  {
    id: 'apple',
    name: 'Apple 服务',
    remoteRuleSetIds: ['geosite-apple', 'geoip-apple'],
    entries: [
      { type: 'domain_keyword', value: 'apple' },
      { type: 'domain_suffix', value: 'apple.com' },
      { type: 'domain_suffix', value: 'icloud.com' }
    ]
  },
  {
    id: 'foreign-sites',
    name: '常见国外站点',
    remoteRuleSetIds: ['geosite-!cn'],
    entries: [
      { type: 'domain_suffix', value: 'com' },
      { type: 'domain_suffix', value: 'net' },
      { type: 'domain_suffix', value: 'org' }
    ]
  },
  {
    id: 'cn-domains',
    name: '国内常见域名',
    remoteRuleSetIds: ['geosite-cn', 'geoip-cn'],
    entries: [
      { type: 'domain_suffix', value: 'cn' },
      { type: 'domain_keyword', value: 'baidu' },
      { type: 'domain_keyword', value: 'taobao' },
      { type: 'domain_keyword', value: 'qq' }
    ]
  }
];
