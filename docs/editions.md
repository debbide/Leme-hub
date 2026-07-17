# Editions

This project now exposes one backend core that can serve two release lines.

## Desktop Edition

- Purpose: local workstation usage, multi-port traffic splitting for browsers/apps
- Default runtime: `LEME_MODE=desktop`
- Default runtime root: executable directory in packaged builds, project root in unpackaged runs
- Default bind: use persisted `uiHost` / `uiPort`
- Typical start command: `npm start`

## Server Edition

- Purpose: headless host service with browser-based control panel
- Runtime: `LEME_MODE=server`
- Typical start command: `npm run start:server`
- Default bind: `0.0.0.0:51888`
- Optional env:
  - `LEME_UI_HOST=<host>` -> explicit bind host
  - `LEME_UI_PORT=<port>` -> explicit bind port

Server mode does **not** inherit persisted desktop `uiHost` / `uiPort` by default.
It uses its own runtime contract and only changes via environment overrides.

## Shared Core Principle

- Same backend core
- Same web panel
- Different startup modes only

## Traffic Capture Modes

Shared web panel supports three mutually exclusive capture modes:

1. **None** — only per-node local ports (`mixed` inbounds)
2. **System proxy** — unified HTTP/SOCKS inbounds + OS proxy settings (Windows registry / Linux gsettings+env)
3. **TUN** — `tun-in` virtual NIC with `auto_route` (Windows + Linux; not macOS in v1)

Per-node local ports remain available in all modes.

### TUN notes

- **Windows desktop**: requires administrator (already set via `requireAdministrator`). Wintun is provided by the sing-box core.
- **Linux server**: systemd unit grants `CAP_NET_ADMIN` / `CAP_NET_RAW` and `DeviceAllow=/dev/net/tun`. TUN is **default off**.
- **macOS**: not supported in v1 (`tun.supported = false`).
- Do not enable TUN and system-proxy capture together; the API rejects that combination.

## Current Scope

Runtime modes, packaging, and optional TUN capture are implemented.
Control-panel authentication remains a separate concern (especially for server binds on `0.0.0.0`).
