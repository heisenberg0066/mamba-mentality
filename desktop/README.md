# Mamba Mentality — Windows desktop app

Electron wrapper that bundles the offline PWA (the repo root) into a Windows app.

- Build locally on Windows: `npm ci && npm run dist` → `dist/` (NSIS installer, portable .exe, zip).
- On Linux: same command, needs `wine` for the NSIS/portable targets.
- CI: push a tag `desktop-vX.Y.Z` (or run "Build Windows app" manually) → builds on `windows-latest` and attaches artifacts to the GitHub Release.

Data lives in Electron's localStorage under `%APPDATA%\Mamba Mentality`. It is separate from the iPhone app; use More → Export/Import JSON backup to move data between devices.
Unsigned build: SmartScreen may show "Windows protected your PC" → More info → Run anyway.
