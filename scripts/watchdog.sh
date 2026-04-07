#!/bin/bash
# Priority Forge Watchdog
# This script monitors both backend and frontend processes and restarts them if they die.
# Run this as a LaunchAgent or manually for belt-and-suspenders reliability.

PRIORITY_FORGE_DIR="$HOME/Desktop/priority-forge"
PIDS_DIR="$PRIORITY_FORGE_DIR/.pids"
LOG_FILE="$PIDS_DIR/watchdog.log"

# Ensure pids directory exists
mkdir -p "$PIDS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_backend() {
    # Check if backend is responding on port 3456
    if curl -s --connect-timeout 2 "http://127.0.0.1:3456/version" > /dev/null 2>&1; then
        return 0  # Backend is up
    fi
    return 1  # Backend is down
}

check_frontend() {
    # Check if frontend is responding on port 5173
    if curl -s --connect-timeout 2 "http://127.0.0.1:5173" > /dev/null 2>&1; then
        return 0  # Frontend is up
    fi
    return 1  # Frontend is down
}

restart_backend() {
    log "Backend down - attempting restart"
    if [ "$(uname)" = "Linux" ]; then
        systemctl --user restart priority-forge-backend 2>/dev/null && log "Restarted via systemctl" || log "systemctl restart failed"
    else
        launchctl kickstart -k "gui/$(id -u)/com.priority-forge.backend" 2>/dev/null && log "Restarted via launchctl" || log "launchctl restart failed"
    fi
}

restart_frontend() {
    log "Frontend down - attempting restart"
    if [ "$(uname)" = "Linux" ]; then
        systemctl --user restart priority-forge-frontend 2>/dev/null && log "Restarted via systemctl" || log "systemctl restart failed"
    else
        launchctl kickstart -k "gui/$(id -u)/com.priority-forge.frontend" 2>/dev/null && log "Restarted via launchctl" || log "launchctl restart failed"
    fi
}

# Main watchdog loop
log "=== Priority Forge Watchdog Started ==="

consecutive_backend_failures=0
consecutive_frontend_failures=0
MAX_CONSECUTIVE_FAILURES=3

while true; do
    # Check backend
    if check_backend; then
        consecutive_backend_failures=0
    else
        consecutive_backend_failures=$((consecutive_backend_failures + 1))
        log "Backend check failed ($consecutive_backend_failures/$MAX_CONSECUTIVE_FAILURES)"
        
        if [ $consecutive_backend_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
            restart_backend
            consecutive_backend_failures=0
            sleep 10  # Give it time to start
        fi
    fi
    
    # Check frontend
    if check_frontend; then
        consecutive_frontend_failures=0
    else
        consecutive_frontend_failures=$((consecutive_frontend_failures + 1))
        log "Frontend check failed ($consecutive_frontend_failures/$MAX_CONSECUTIVE_FAILURES)"
        
        if [ $consecutive_frontend_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
            restart_frontend
            consecutive_frontend_failures=0
            sleep 10  # Give it time to start
        fi
    fi
    
    # Check every 30 seconds
    sleep 30
done
