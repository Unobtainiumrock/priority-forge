# Priority Forge systemd User Services (Ubuntu/Linux)

This directory contains systemd user-service unit files — the Ubuntu/Linux equivalent of the macOS Launch Agents in `launchd/`.

## Overview

Three services mirror the macOS setup:

| Service | Description | Port |
|---------|-------------|------|
| `priority-forge-backend` | MCP/REST API server | 3456 |
| `priority-forge-frontend` | React dev dashboard | 5173 |
| `priority-forge-watchdog` | HTTP health monitor, restarts if unresponsive | — |

## Quick Install

```bash
# From project root — installs, enables, and starts all three services
./setup.sh install-systemd
# or directly:
bash scripts/install-systemd.sh install
```

This will:
1. Copy unit files to `~/.config/systemd/user/`
2. Enable `loginctl linger` so services start at boot (not just at login)
3. Enable and start all three services
4. Run a health check

## Managing Services

```bash
# Status
bash scripts/install-systemd.sh status
# or: systemctl --user status priority-forge-backend

# Restart all
bash scripts/install-systemd.sh restart

# Stop all
bash scripts/install-systemd.sh stop

# Uninstall
bash scripts/install-systemd.sh uninstall

# Follow logs (backend by default)
bash scripts/install-systemd.sh logs
bash scripts/install-systemd.sh logs frontend
bash scripts/install-systemd.sh logs watchdog
```

## Logs

```bash
# Via journald (recommended)
journalctl --user -u priority-forge-backend -f
journalctl --user -u priority-forge-frontend -f
journalctl --user -u priority-forge-watchdog -f

# Via log files
tail -f ~/.local/share/priority-forge/backend.log
tail -f ~/.local/share/priority-forge/frontend.log
tail -f ~/.local/share/priority-forge/watchdog.log
```

## How It Works

### Boot Startup (loginctl linger)

By default, systemd user services only run while the user is logged in. The install script runs `loginctl enable-linger $USER` so the user's systemd instance (and its services) starts at boot, even before login — identical to how macOS Launch Agents work.

### Crash Recovery

`Restart=on-failure` in the backend/frontend units means systemd auto-restarts them if they crash. The watchdog adds an extra layer: it polls `http://localhost:3456/health` and `http://localhost:5173` every 30 seconds and force-restarts via `systemctl --user restart` if they stop responding (e.g., hung but not crashed).

## Updating After Moving the Project

If you move the project directory, re-run the installer:

```bash
bash scripts/install-systemd.sh uninstall
bash scripts/install-systemd.sh install
```

The service files reference absolute paths. Re-installing regenerates them from the current location.

## Node.js / nvm Note

The service files hardcode the nvm node path (`~/.nvm/versions/node/v20.19.0/bin`). If you upgrade Node.js, update `Environment=PATH=...` in all three service files and run `systemctl --user daemon-reload`.
