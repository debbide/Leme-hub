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

## Current Scope

This foundation only separates runtime mode and startup behavior.
Packaging, authentication, and desktop shell integration are intentionally left for the next stage.
