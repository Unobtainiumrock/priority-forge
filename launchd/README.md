# Priority Forge Launch Agents

This directory contains macOS Launch Agent configuration files that automatically start and manage Priority Forge services.

## Overview

Priority Forge runs three services:
1. **Backend** - MCP server (port 3456)
2. **Frontend** - React development server (port 5173)
3. **Watchdog** - Health monitor that auto-restarts services if they crash

## Files

- `com.priority-forge.backend.plist` - Backend MCP server
- `com.priority-forge.frontend.plist` - Frontend development server
- `com.priority-forge.watchdog.plist` - Service health monitor

## Installation

### Prerequisites

1. Ensure Priority Forge is cloned to a stable location (not Desktop if you move things around)
2. Run `npm install` in the project root and `npm install` in `frontend/`
3. Build the backend: `npm run build`

### Quick Setup

Run the included setup script which handles everything:

```bash
./setup.sh install-launchd
```

This will:
- Copy .plist files to `~/Library/LaunchAgents/`
- Update paths to match your current installation
- Load all three services
- Verify they're running

### Manual Installation

If you prefer to install manually:

```bash
# 1. Copy plist files to LaunchAgents directory
cp launchd/*.plist ~/Library/LaunchAgents/

# 2. Update paths in the plist files if Priority Forge is not in ~/Desktop/priority-forge
#    (Edit the WorkingDirectory and ProgramArguments paths in each file)

# 3. Load the services
launchctl load ~/Library/LaunchAgents/com.priority-forge.backend.plist
launchctl load ~/Library/LaunchAgents/com.priority-forge.frontend.plist
launchctl load ~/Library/LaunchAgents/com.priority-forge.watchdog.plist

# 4. Verify they're running
launchctl list | grep priority-forge
```

## Verification

Check that all services are running:

```bash
# Check process status
launchctl list | grep priority-forge

# Test backend health
curl http://localhost:3456/version

# Test frontend
curl http://localhost:5173
```

You should see three entries:
- `com.priority-forge.backend` (should show PID)
- `com.priority-forge.frontend` (should show PID)
- `com.priority-forge.watchdog` (should show PID)

## Logs

View service logs:

```bash
# Backend logs
tail -f ~/.local/share/priority-forge/.pids/launchd-backend.log
tail -f ~/.local/share/priority-forge/.pids/launchd-backend-error.log

# Frontend logs
tail -f ~/.local/share/priority-forge/.pids/launchd-frontend.log
tail -f ~/.local/share/priority-forge/.pids/launchd-frontend-error.log

# Watchdog logs
tail -f /tmp/priority-forge-watchdog.log
tail -f /tmp/priority-forge-watchdog-stdout.log
tail -f /tmp/priority-forge-watchdog-stderr.log
```

## Restarting Services

```bash
# Restart individual services
launchctl kickstart -k gui/$(id -u)/com.priority-forge.backend
launchctl kickstart -k gui/$(id -u)/com.priority-forge.frontend
launchctl kickstart -k gui/$(id -u)/com.priority-forge.watchdog

# Or use the setup script
./setup.sh restart
```

## Stopping Services

```bash
# Stop individual services
launchctl stop com.priority-forge.backend
launchctl stop com.priority-forge.frontend
launchctl stop com.priority-forge.watchdog

# Or use the setup script
./setup.sh stop
```

## Uninstallation

To completely remove Priority Forge launch agents:

```bash
# 1. Unload the services
launchctl unload ~/Library/LaunchAgents/com.priority-forge.backend.plist
launchctl unload ~/Library/LaunchAgents/com.priority-forge.frontend.plist
launchctl unload ~/Library/LaunchAgents/com.priority-forge.watchdog.plist

# 2. Remove plist files
rm ~/Library/LaunchAgents/com.priority-forge.*.plist

# Or use the setup script
./setup.sh uninstall-launchd
```

## Customization

### Changing Ports

Edit the following in the .plist files:

**Backend (default: 3456):**
Set `PORT` environment variable in `com.priority-forge.backend.plist`

**Frontend (default: 5173):**
This is controlled by Vite. To change it, modify `frontend/vite.config.ts`

### Changing Installation Path

If you move Priority Forge to a different directory, update these paths in each .plist file:

1. `WorkingDirectory` - Set to your Priority Forge installation path
2. `ProgramArguments` - Update full paths to executables
3. `StandardOutPath` and `StandardErrorPath` - Update log file paths

## How It Works

### Backend Service
- Runs Node.js MCP server from `dist/index.js`
- Listens on port 3456
- Auto-starts on login (`RunAtLoad: true`)
- Restarts if it crashes (`KeepAlive: true`)

### Frontend Service
- Runs `npm run dev` in the `frontend/` directory
- Listens on port 5173
- Auto-starts on login
- Restarts on crash but not on successful exit

### Watchdog Service
- Runs a bash script that checks backend and frontend health every 30 seconds
- Pings backend at `http://localhost:3456/version`
- Pings frontend at `http://localhost:5173`
- Auto-restarts services if health checks fail
- Logs all actions to `/tmp/priority-forge-watchdog.log`

## Troubleshooting

### Services won't start

1. Check logs for errors:
   ```bash
   cat ~/.local/share/priority-forge/.pids/launchd-backend-error.log
   cat ~/.local/share/priority-forge/.pids/launchd-frontend-error.log
   ```

2. Verify Node.js is installed:
   ```bash
   which node
   /opt/homebrew/bin/node
   ```

3. Verify Priority Forge is built:
   ```bash
   ls dist/index.js
   ```

### Port conflicts

If ports 3456 or 5173 are already in use:

```bash
# Check what's using the port
lsof -i :3456
lsof -i :5173

# Kill the process if needed
kill -9 <PID>
```

### Path issues after moving Priority Forge

If you moved Priority Forge to a different directory:

1. Update all paths in the .plist files
2. Reload the services:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.priority-forge.*.plist
   launchctl load ~/Library/LaunchAgents/com.priority-forge.*.plist
   ```

### Services crash immediately

Check that:
- Dependencies are installed: `npm install` and `cd frontend && npm install`
- Backend is built: `npm run build`
- Permissions are correct: `chmod +x scripts/watchdog.sh`

## Development vs Production

These launch agents are configured for **development mode**:
- Frontend runs with hot reload (`npm run dev`)
- Backend runs compiled JavaScript
- Logs are verbose

For production deployment, consider:
- Building frontend: `cd frontend && npm run build`
- Serving static frontend files with nginx/caddy
- Running backend with production environment variables
- Implementing proper log rotation
- Using a process manager like PM2 for more robust service management

## Additional Resources

- [launchd man page](https://ss64.com/osx/launchctl.html)
- [Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- Priority Forge main documentation: [../README.md](../README.md)
