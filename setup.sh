#!/bin/bash

# Priority Forge - Setup & Management Script
# This script bootstraps the development environment and manages the full stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Get script directory (where setup.sh lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       Priority Forge Setup             ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

show_help() {
    echo -e "${BOLD}Priority Forge - Setup & Management Script${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  ./setup.sh [command]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo "  install       Full installation (dependencies, database, MCP config)"
    echo "  start         Start the full stack (backend + frontend)"
    echo "  start:backend Start only the backend server"
    echo "  start:frontend Start only the frontend dev server"
    echo "  stop          Stop all running servers"
    echo "  status        Check if servers are running"
    echo "  logs          Show recent logs from running servers"
    echo "  verify        Verify the setup is working correctly"
    echo "  help          Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./setup.sh              # Run full installation (first time setup)"
    echo "  ./setup.sh install      # Same as above"
    echo "  ./setup.sh start        # Start both backend and frontend"
    echo "  ./setup.sh start:backend # Start only the API server"
    echo "  ./setup.sh stop         # Stop all servers"
    echo ""
    echo -e "${BOLD}Ports:${NC}"
    echo "  Backend:  http://localhost:3456"
    echo "  Frontend: http://localhost:5173"
    echo ""
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

# Ensure PID directory exists
ensure_pid_dir() {
    mkdir -p "$PID_DIR"
}

# Check if a process is running by PID file
is_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Get PID from file
get_pid() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        cat "$pid_file"
    fi
}

# Check prerequisites (Node.js, npm)
check_prerequisites() {
    local OS=$(detect_os)

    # Windows warning
    if [ "$OS" = "windows" ]; then
        print_error "Windows is not directly supported."
        echo "Please use WSL (Windows Subsystem for Linux) and run this script from there."
        echo "See: https://docs.microsoft.com/en-us/windows/wsl/install"
        exit 1
    fi

    if [ "$OS" = "unknown" ]; then
        print_error "Unknown operating system. This script supports macOS and Linux."
        exit 1
    fi

    # Check for Node.js
    NODE_INSTALLED=false
    NODE_VERSION=""

    if command -v node &> /dev/null; then
        NODE_INSTALLED=true
        NODE_VERSION=$(node --version)
    else
        # Check if nvm is installed
        if [ -d "$HOME/.nvm" ] || command -v nvm &> /dev/null; then
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            
            if command -v node &> /dev/null; then
                NODE_INSTALLED=true
                NODE_VERSION=$(node --version)
            fi
        fi
    fi

    if [ "$NODE_INSTALLED" = false ]; then
        print_error "Node.js is required but not found."
        echo "Please install Node.js (v18+) and run this script again."
        echo "  - nvm: https://github.com/nvm-sh/nvm"
        echo "  - macOS: brew install node"
        echo "  - Linux: sudo apt install nodejs npm"
        exit 1
    fi

    # Check Node version (need 18+)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_warning "Node.js version $NODE_VERSION is below recommended (v18+)."
    fi

    # Check for npm
    if ! command -v npm &> /dev/null; then
        print_error "npm not found. Please install npm and run this script again."
        exit 1
    fi

    return 0
}

# Full installation
do_install() {
    local OS=$(detect_os)
    
    print_header
    echo "Detected OS: $OS"
    echo ""

    # Step 1: Check for Homebrew (macOS only)
    print_step "Checking prerequisites..."

    if [ "$OS" = "macos" ]; then
        if ! command -v brew &> /dev/null; then
            print_warning "Homebrew not found."
            echo "Homebrew is the recommended package manager for macOS."
            read -p "Install Homebrew? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_step "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                
                # Add brew to PATH for this session
                if [ -f "/opt/homebrew/bin/brew" ]; then
                    eval "$(/opt/homebrew/bin/brew shellenv)"
                elif [ -f "/usr/local/bin/brew" ]; then
                    eval "$(/usr/local/bin/brew shellenv)"
                fi
                print_success "Homebrew installed"
            else
                print_warning "Skipping Homebrew. You'll need to install Node.js manually."
            fi
        else
            print_success "Homebrew found"
        fi
    fi

    # Step 2: Check for Node.js
    NODE_INSTALLED=false
    NODE_VERSION=""

    if command -v node &> /dev/null; then
        NODE_INSTALLED=true
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    else
        print_warning "Node.js not found."
        
        # Check if nvm is installed
        if [ -d "$HOME/.nvm" ] || command -v nvm &> /dev/null; then
            print_step "nvm detected. Loading nvm..."
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            
            if command -v node &> /dev/null; then
                NODE_INSTALLED=true
                NODE_VERSION=$(node --version)
                print_success "Node.js found via nvm: $NODE_VERSION"
            else
                print_step "Installing Node.js via nvm..."
                nvm install --lts
                nvm use --lts
                NODE_INSTALLED=true
                NODE_VERSION=$(node --version)
                print_success "Node.js installed via nvm: $NODE_VERSION"
            fi
        elif [ "$OS" = "macos" ] && command -v brew &> /dev/null; then
            read -p "Install Node.js via Homebrew? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_step "Installing Node.js via Homebrew..."
                brew install node
                NODE_INSTALLED=true
                NODE_VERSION=$(node --version)
                print_success "Node.js installed: $NODE_VERSION"
            fi
        elif [ "$OS" = "linux" ]; then
            echo "Please install Node.js using your package manager or nvm:"
            echo "  - nvm: https://github.com/nvm-sh/nvm"
            echo "  - apt: sudo apt install nodejs npm"
            echo "  - dnf: sudo dnf install nodejs npm"
            exit 1
        fi
    fi

    if [ "$NODE_INSTALLED" = false ]; then
        print_error "Node.js is required but not installed. Please install it and run this script again."
        exit 1
    fi

    # Check Node version (need 18+)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_warning "Node.js version $NODE_VERSION is below recommended (v18+)."
        echo "Some features may not work correctly."
    fi

    # Step 3: Check for npm
    if ! command -v npm &> /dev/null; then
        print_error "npm not found. Please install npm and run this script again."
        exit 1
    fi
    print_success "npm found: $(npm --version)"

    # Step 4: Install backend dependencies
    print_step "Installing backend dependencies..."
    cd "$SCRIPT_DIR"
    npm install
    print_success "Backend dependencies installed"

    # Step 5: Install frontend dependencies
    print_step "Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend"
    npm install
    cd "$SCRIPT_DIR"
    print_success "Frontend dependencies installed"

    # Step 6: Initialize database if needed
    print_step "Checking database..."
    if [ -f "$SCRIPT_DIR/data/progress.json" ]; then
        print_success "Database already exists (skipping seed)"
    else
        print_step "Creating initial database..."
        npx tsx scripts/seed.ts
        print_success "Database initialized"
    fi

    # Step 7: Configure MCP (interactive)
    echo ""
    print_step "Configuring MCP integration..."
    npx tsx scripts/configure-mcp.ts

    # Step 8: Verify setup
    echo ""
    print_step "Verifying setup..."
    npx tsx scripts/verify.ts

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║       Setup Complete!                  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Start the full stack:  ./setup.sh start"
    echo "  2. Or start individually:"
    echo "     - Backend only:  ./setup.sh start:backend"
    echo "     - Frontend only: ./setup.sh start:frontend"
    echo "  3. Restart your AI tool (Cursor/Droid/Claude Code)"
    echo "  4. The AI will now track tasks automatically!"
    echo ""
    echo "Useful commands:"
    echo "  ./setup.sh status  - Check if servers are running"
    echo "  ./setup.sh stop    - Stop all servers"
    echo "  ./setup.sh help    - Show all available commands"
    echo ""
}

# Start backend server
start_backend() {
    ensure_pid_dir
    cd "$SCRIPT_DIR"

    if is_running "$PID_DIR/backend.pid"; then
        print_warning "Backend is already running (PID: $(get_pid "$PID_DIR/backend.pid"))"
        return 0
    fi

    print_step "Starting backend server..."
    
    # Start backend in background
    nohup npm run dev > "$PID_DIR/backend.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/backend.pid"
    
    # Wait a moment for the server to start
    sleep 2
    
    if is_running "$PID_DIR/backend.pid"; then
        print_success "Backend started on http://localhost:3456 (PID: $pid)"
        return 0
    else
        print_error "Backend failed to start. Check logs: $PID_DIR/backend.log"
        rm -f "$PID_DIR/backend.pid"
        return 1
    fi
}

# Start frontend server
start_frontend() {
    ensure_pid_dir
    cd "$SCRIPT_DIR/frontend"

    if is_running "$PID_DIR/frontend.pid"; then
        print_warning "Frontend is already running (PID: $(get_pid "$PID_DIR/frontend.pid"))"
        return 0
    fi

    print_step "Starting frontend dev server..."
    
    # Start frontend in background
    nohup npm run dev > "$PID_DIR/frontend.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/frontend.pid"
    
    # Wait a moment for the server to start
    sleep 3
    
    if is_running "$PID_DIR/frontend.pid"; then
        print_success "Frontend started on http://localhost:5173 (PID: $pid)"
        return 0
    else
        print_error "Frontend failed to start. Check logs: $PID_DIR/frontend.log"
        rm -f "$PID_DIR/frontend.pid"
        return 1
    fi
}

# Start full stack
do_start() {
    check_prerequisites
    
    echo ""
    echo -e "${BOLD}Starting Priority Forge Full Stack${NC}"
    echo ""
    
    start_backend
    start_frontend
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║       Servers Running!                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Backend:  http://localhost:3456"
    echo "  Frontend: http://localhost:5173"
    echo ""
    echo "Run './setup.sh stop' to stop all servers"
    echo "Run './setup.sh logs' to view server logs"
    echo ""
}

# Start only backend
do_start_backend() {
    check_prerequisites
    
    echo ""
    echo -e "${BOLD}Starting Priority Forge Backend${NC}"
    echo ""
    
    start_backend
    
    echo ""
    echo "Run './setup.sh stop' to stop the server"
    echo ""
}

# Start only frontend
do_start_frontend() {
    check_prerequisites
    
    echo ""
    echo -e "${BOLD}Starting Priority Forge Frontend${NC}"
    echo ""
    
    # Check if backend is running
    if ! is_running "$PID_DIR/backend.pid"; then
        print_warning "Backend is not running. Frontend may not work correctly."
        echo "Start backend with: ./setup.sh start:backend"
        echo ""
    fi
    
    start_frontend
    
    echo ""
    echo "Run './setup.sh stop' to stop the server"
    echo ""
}

# Stop all servers
do_stop() {
    ensure_pid_dir
    
    echo ""
    echo -e "${BOLD}Stopping Priority Forge Servers${NC}"
    echo ""
    
    local stopped=false
    
    # Stop backend
    if is_running "$PID_DIR/backend.pid"; then
        local pid=$(get_pid "$PID_DIR/backend.pid")
        print_step "Stopping backend (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        rm -f "$PID_DIR/backend.pid"
        print_success "Backend stopped"
        stopped=true
    fi
    
    # Stop frontend
    if is_running "$PID_DIR/frontend.pid"; then
        local pid=$(get_pid "$PID_DIR/frontend.pid")
        print_step "Stopping frontend (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        rm -f "$PID_DIR/frontend.pid"
        print_success "Frontend stopped"
        stopped=true
    fi
    
    # Also try to kill any orphaned processes on the default ports
    if lsof -ti :3456 > /dev/null 2>&1; then
        print_step "Killing process on port 3456..."
        kill $(lsof -ti :3456) 2>/dev/null || true
        stopped=true
    fi
    
    if lsof -ti :5173 > /dev/null 2>&1; then
        print_step "Killing process on port 5173..."
        kill $(lsof -ti :5173) 2>/dev/null || true
        stopped=true
    fi
    
    if [ "$stopped" = false ]; then
        print_info "No servers were running"
    else
        echo ""
        print_success "All servers stopped"
    fi
    echo ""
}

# Check server status
do_status() {
    ensure_pid_dir
    
    echo ""
    echo -e "${BOLD}Priority Forge Server Status${NC}"
    echo ""
    
    # Check backend
    if is_running "$PID_DIR/backend.pid"; then
        local pid=$(get_pid "$PID_DIR/backend.pid")
        echo -e "  Backend:  ${GREEN}● Running${NC} (PID: $pid) - http://localhost:3456"
    elif lsof -ti :3456 > /dev/null 2>&1; then
        local pid=$(lsof -ti :3456 | head -1)
        echo -e "  Backend:  ${YELLOW}● Running (unmanaged)${NC} (PID: $pid) - http://localhost:3456"
    else
        echo -e "  Backend:  ${RED}○ Stopped${NC}"
    fi
    
    # Check frontend
    if is_running "$PID_DIR/frontend.pid"; then
        local pid=$(get_pid "$PID_DIR/frontend.pid")
        echo -e "  Frontend: ${GREEN}● Running${NC} (PID: $pid) - http://localhost:5173"
    elif lsof -ti :5173 > /dev/null 2>&1; then
        local pid=$(lsof -ti :5173 | head -1)
        echo -e "  Frontend: ${YELLOW}● Running (unmanaged)${NC} (PID: $pid) - http://localhost:5173"
    else
        echo -e "  Frontend: ${RED}○ Stopped${NC}"
    fi
    
    echo ""
}

# Show logs
do_logs() {
    ensure_pid_dir
    
    echo ""
    echo -e "${BOLD}Priority Forge Server Logs${NC}"
    echo ""
    
    if [ -f "$PID_DIR/backend.log" ]; then
        echo -e "${CYAN}=== Backend Logs (last 20 lines) ===${NC}"
        tail -20 "$PID_DIR/backend.log"
        echo ""
    else
        echo "No backend logs found"
    fi
    
    if [ -f "$PID_DIR/frontend.log" ]; then
        echo -e "${CYAN}=== Frontend Logs (last 20 lines) ===${NC}"
        tail -20 "$PID_DIR/frontend.log"
        echo ""
    else
        echo "No frontend logs found"
    fi
    
    echo ""
    echo "For live logs, run:"
    echo "  tail -f $PID_DIR/backend.log"
    echo "  tail -f $PID_DIR/frontend.log"
    echo ""
}

# Run verification
do_verify() {
    cd "$SCRIPT_DIR"
    echo ""
    print_step "Verifying setup..."
    npx tsx scripts/verify.ts
    echo ""
}

# Main command router
case "${1:-install}" in
    install|"")
        do_install
        ;;
    start)
        do_start
        ;;
    start:backend)
        do_start_backend
        ;;
    start:frontend)
        do_start_frontend
        ;;
    stop)
        do_stop
        ;;
    status)
        do_status
        ;;
    logs)
        do_logs
        ;;
    verify)
        do_verify
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
