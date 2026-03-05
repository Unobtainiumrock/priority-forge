#!/bin/bash
# Priority Forge systemd user service installer (Ubuntu/Linux)
# Mirrors the macOS launchd setup for automatic startup and crash recovery.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
LOG_DIR="$HOME/.local/share/priority-forge"

log() { echo "[priority-forge] $1"; }
err() { echo "[priority-forge] ERROR: $1" >&2; exit 1; }

# ── Subcommands ──────────────────────────────────────────────────────────────

install() {
    log "Installing systemd user services..."

    mkdir -p "$SYSTEMD_USER_DIR" "$LOG_DIR"
    chmod +x "$SCRIPT_DIR/watchdog-linux.sh"

    for svc in priority-forge-backend priority-forge-frontend priority-forge-watchdog; do
        cp "$PROJECT_DIR/systemd/${svc}.service" "$SYSTEMD_USER_DIR/"
        log "  Installed ${svc}.service"
    done

    systemctl --user daemon-reload

    # Enable linger so services start at boot (not just at login)
    if ! loginctl show-user "$USER" | grep -q "Linger=yes"; then
        log "Enabling linger for $USER (services will start at boot)..."
        loginctl enable-linger "$USER"
    fi

    systemctl --user enable priority-forge-backend.service
    systemctl --user enable priority-forge-frontend.service
    systemctl --user enable priority-forge-watchdog.service

    systemctl --user start priority-forge-backend.service
    systemctl --user start priority-forge-frontend.service
    systemctl --user start priority-forge-watchdog.service

    sleep 3
    status
}

status() {
    log "Service status:"
    for svc in priority-forge-backend priority-forge-frontend priority-forge-watchdog; do
        STATE=$(systemctl --user is-active "${svc}.service" 2>/dev/null || echo "inactive")
        printf "  %-40s %s\n" "${svc}.service" "$STATE"
    done

    echo ""
    log "Backend health check:"
    curl -s http://localhost:3456/health && echo "" || echo "  (not responding)"
}

restart() {
    log "Restarting all services..."
    systemctl --user restart priority-forge-backend.service
    systemctl --user restart priority-forge-frontend.service
    systemctl --user restart priority-forge-watchdog.service
    sleep 2
    status
}

stop() {
    log "Stopping all services..."
    systemctl --user stop priority-forge-watchdog.service 2>/dev/null || true
    systemctl --user stop priority-forge-frontend.service 2>/dev/null || true
    systemctl --user stop priority-forge-backend.service 2>/dev/null || true
    log "All services stopped."
}

uninstall() {
    log "Uninstalling systemd user services..."
    stop
    for svc in priority-forge-backend priority-forge-frontend priority-forge-watchdog; do
        systemctl --user disable "${svc}.service" 2>/dev/null || true
        rm -f "$SYSTEMD_USER_DIR/${svc}.service"
        log "  Removed ${svc}.service"
    done
    systemctl --user daemon-reload
    log "Done. Logs remain in $LOG_DIR"
}

logs() {
    local svc="${2:-backend}"
    journalctl --user -u "priority-forge-${svc}.service" -f
}

# ── Dispatch ─────────────────────────────────────────────────────────────────

case "${1:-install}" in
    install)   install ;;
    status)    status ;;
    restart)   restart ;;
    stop)      stop ;;
    uninstall) uninstall ;;
    logs)      logs "$@" ;;
    *)
        echo "Usage: $0 {install|status|restart|stop|uninstall|logs [backend|frontend|watchdog]}"
        exit 1
        ;;
esac
