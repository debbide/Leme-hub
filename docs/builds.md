# Build Targets

## Desktop Edition

- Windows: `npm run build:desktop:win`
- Linux deb: `npm run build:desktop:deb`

Desktop builds use Electron as a thin shell around the shared local backend.

Desktop icon files:

- Windows: `desktop/resources/icon.ico`
- Linux: `desktop/resources/icon.png`

## Server Edition

- Linux amd64 + arm64 binary bundle: `npm run build:server`
- GitHub Release 会同时附带 `install-server.sh` 交互式安装脚本

Recommended environment:

- Run the server binary build on Linux CI/runner (for example GitHub Actions Ubuntu).
- Cross-building the Linux targets from a Windows workstation is not guaranteed to work with `pkg`.

Build pipeline detail:

- The server release first bundles the Node entrypoint with `esbuild`.
- `pkg` then packages the bundled server entry into Linux binaries.

The server build packages the shared backend core as standalone Linux executables.

Interactive install script capabilities:

- Chinese menu
- Install / update
- Uninstall
- Control panel host / port selection (default `0.0.0.0:51888`)
- Unified proxy enable / disable selection
- Proxy listen host selection
- HTTP / SOCKS5 proxy port configuration (default `18999` / `18998`)
- Installs a `systemd` service automatically

## Runtime Notes

- Desktop edition keeps the web panel embedded while still serving the same local HTTP control surface.
- Desktop edition stores `data/`, `logs/`, and `bin/` beside the packaged executable by default.
- Server edition starts in `LEME_MODE=server` and listens on `0.0.0.0:51888` by default.

## CI / Release

- `.github/workflows/ci.yml` runs tests on Windows and Ubuntu.
- `.github/workflows/release.yml` builds:
  - Windows desktop installer
  - Linux deb desktop package
  - Linux server binaries for amd64 and arm64
