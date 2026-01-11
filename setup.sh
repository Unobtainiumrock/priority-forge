#!/bin/bash

# Priority Forge - Setup Script
# This script bootstraps the entire development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

OS=$(detect_os)

print_header

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

# Step 4: Install dependencies
print_step "Installing dependencies..."
npm install
print_success "Dependencies installed"

# Step 5: Initialize database if needed
print_step "Checking database..."
if [ -f "data/progress.json" ]; then
    print_success "Database already exists (skipping seed)"
else
    print_step "Creating initial database..."
    npx tsx scripts/seed.ts
    print_success "Database initialized"
fi

# Step 6: Configure MCP (interactive)
echo ""
print_step "Configuring MCP integration..."
npx tsx scripts/configure-mcp.ts

# Step 7: Verify setup
echo ""
print_step "Verifying setup..."
npx tsx scripts/verify.ts

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Setup Complete!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the server:  npm run dev"
echo "  2. Restart your AI tool (Cursor/Droid/Claude Code)"
echo "  3. The AI will now track tasks automatically!"
echo ""
