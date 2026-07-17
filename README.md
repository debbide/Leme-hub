# Leme Hub

Leme Hub 是一个面向桌面端和服务器场景的本地代理分流客户端。

## Linux Server 一键安装

`amd64`:

```bash
curl -fsSL -o /tmp/install-server.sh https://github.com/debbide/Leme-hub/releases/latest/download/install-server.sh && sudo LEME_DOWNLOAD_URL=https://github.com/debbide/Leme-hub/releases/latest/download/leme-hub-server-linux-amd64 bash /tmp/install-server.sh
```

`arm64`:

```bash
curl -fsSL -o /tmp/install-server.sh https://github.com/debbide/Leme-hub/releases/latest/download/install-server.sh && sudo LEME_DOWNLOAD_URL=https://github.com/debbide/Leme-hub/releases/latest/download/leme-hub-server-linux-arm64 bash /tmp/install-server.sh
```

安装脚本特性：

- 中文交互界面
- 支持安装、更新、卸载
- 可分别设置控制面板监听地址和监听端口，默认 `0.0.0.0:51888`
- 可设置统一代理入口是否启用
- 可设置代理监听地址
- 可设置 HTTP / SOCKS5 代理端口，默认 `18999 / 18998`
- 自动注册 `systemd` 服务 `leme-hub-server`

安装完成后，如果监听地址是 `0.0.0.0`，可以直接通过 `http://服务器IP:51888` 用浏览器访问控制面板。

### TUN 接管（可选）

面板「流量接管」可选 **关闭 / 系统代理 / TUN 网卡**（互斥）。节点本地端口始终保留。

Linux 服务端 unit 已预置 `CAP_NET_ADMIN` 与 `/dev/net/tun` 权限；**默认关闭 TUN**，需在面板显式开启。若是旧版安装，请重新跑安装脚本或手动更新 unit 后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart leme-hub-server
```

Windows 桌面版需管理员运行（安装包已请求管理员）。macOS 暂不支持 TUN。

安全提示：服务端面板默认可监听 `0.0.0.0`，开启 TUN 前请确认面板访问范围与防火墙策略。

## Third-Party Components

Leme Hub can download and run the sing-box proxy core. sing-box is an
independent open-source project licensed under GPL-3.0-or-later, developed by
SagerNet and contributors. Leme Hub is not an official sing-box project.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for details.
