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
