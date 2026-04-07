#!/bin/bash
# Priority Forge Watchdog (Linux/systemd)
# Monitors backend and frontend health; restarts via systemctl --user if unresponsive.

LOG_DIR="$HOME/.local/share/priority-forge"
LOG_FILE="$LOG_DIR/watchdog.log"
MAX_CONSECUTIVE_FAILURES=3

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_backend() {
    curl -s --connect-timeout 2 "http://127.0.0.1:3456/health" > /dev/null 2>&1
}

check_frontend() {
    curl -s --connect-timeout 2 "http://127.0.0.1:5173" > /dev/null 2>&1
}

restart_backend() {
    log "Backend unresponsive — restarting via systemctl"
    systemctl --user restart priority-forge-backend.service
}

restart_frontend() {
    log "Frontend unresponsive — restarting via systemctl"
    systemctl --user restart priority-forge-frontend.service
}

log "=== Priority Forge Watchdog Started ==="

consecutive_backend_failures=0
consecutive_frontend_failures=0

while true; do
    if check_backend; then
        consecutive_backend_failures=0
    else
        consecutive_backend_failures=$((consecutive_backend_failures + 1))
        log "Backend check failed ($consecutive_backend_failures/$MAX_CONSECUTIVE_FAILURES)"
        if [ $consecutive_backend_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
            restart_backend
            consecutive_backend_failures=0
            sleep 10
        fi
    fi

    if check_frontend; then
        consecutive_frontend_failures=0
    else
        consecutive_frontend_failures=$((consecutive_frontend_failures + 1))
        log "Frontend check failed ($consecutive_frontend_failures/$MAX_CONSECUTIVE_FAILURES)"
        if [ $consecutive_frontend_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
            restart_frontend
            consecutive_frontend_failures=0
            sleep 10
        fi
    fi

    sleep 30
done
