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

Recommended environment:

- Run the server binary build on Linux CI/runner (for example GitHub Actions Ubuntu).
- Cross-building the Linux targets from a Windows workstation is not guaranteed to work with `pkg`.

The server build packages the shared backend core as standalone Linux executables.

## Runtime Notes

- Desktop edition keeps the web panel embedded while still serving the same local HTTP control surface.
- Server edition starts in `LEME_MODE=server` and can be exposed remotely with `LEME_ALLOW_REMOTE=true`.

## CI / Release

- `.github/workflows/ci.yml` runs tests on Windows and Ubuntu.
- `.github/workflows/release.yml` builds:
  - Windows desktop installer
  - Linux deb desktop package
  - Linux server binaries for amd64 and arm64
