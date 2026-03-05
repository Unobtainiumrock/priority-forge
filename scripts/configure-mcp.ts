#!/usr/bin/env npx tsx

// Interactive MCP configuration script
// Configures MCP server connection + agent rules for Cursor, Droid, or Claude Code

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';
import { execSync } from 'child_process';

const HOME = os.homedir();
// Stable install location for the proxy — independent of where the repo lives.
// ~/.local/share is the XDG data home on Linux; ~/Library/Application Support on macOS.
const PROXY_INSTALL_DIR = os.platform() === 'darwin'
  ? path.join(HOME, 'Library', 'Application Support', 'priority-forge')
  : path.join(HOME, '.local', 'share', 'priority-forge');
const PROXY_INSTALL_PATH = path.join(PROXY_INSTALL_DIR, 'mcp-proxy.js');

interface MCPConfig {
  mcpServers: {
    [key: string]: {
      type?: string;
      url: string;
    };
  };
}

interface ToolConfig {
  name: string;
  mcpConfigPath: string;
  agentRulesPath: string;
  mcpConfigFormat: (url: string) => MCPConfig;
  agentRulesHeader: string;
}

const TOOLS: Record<string, ToolConfig> = {
  '1': {
    name: 'Cursor',
    mcpConfigPath: path.join(HOME, '.cursor', 'mcp.json'),
    agentRulesPath: path.join(HOME, '.cursorrules'),
    mcpConfigFormat: (url: string) => ({
      mcpServers: {
        'priority-forge': { url }
      }
    }),
    agentRulesHeader: '# Priority Forge Configuration (auto-generated)\n\n'
  },
  '2': {
    name: 'Droid (Factory CLI)',
    mcpConfigPath: path.join(HOME, '.factory', 'mcp.json'),
    agentRulesPath: path.join(HOME, '.factory', 'AGENTS.md'),
    mcpConfigFormat: (url: string) => ({
      mcpServers: {
        'priority-forge': { type: 'http', url }
      }
    }),
    agentRulesHeader: '<!-- Priority Forge Configuration (auto-generated) -->\n\n'
  },
  '3': {
    name: 'Claude Code CLI',
    // MCP is registered via `claude mcp add` (local scope, per working directory).
    // --scope user writes to top-level mcpServers but Claude Code does NOT load that.
    // Only projects[cwd].mcpServers (local scope) is loaded in sessions.
    // mcpConfigPath is unused for Claude Code — configureMCP handles it specially.
    mcpConfigPath: '',
    agentRulesPath: path.join(HOME, '.claude', 'CLAUDE.md'),
    mcpConfigFormat: (_url: string) => ({ mcpServers: {} }),
    agentRulesHeader: '<!-- Priority Forge Configuration (auto-generated) -->\n\n'
  }
};

const SERVER_URL = 'http://localhost:3456/mcp';
const AGENT_RULES_SOURCE = path.join(__dirname, '..', 'AGENT_RULES.md');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created directory: ${dir}`);
  }
}

function readJsonFile(filePath: string): any {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

function mergeMCPConfig(existing: MCPConfig | null, newConfig: MCPConfig): MCPConfig {
  if (!existing) {
    return newConfig;
  }
  
  return {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      ...newConfig.mcpServers
    }
  };
}

function configureMCPClaudeCode(): boolean {
  console.log(`\n  Configuring MCP for Claude Code CLI...`);

  // KEY FINDING: `--scope user` writes to ~/.claude.json → mcpServers (top-level)
  // but Claude Code does NOT load top-level mcpServers in sessions.
  // Claude Code only loads from ~/.claude.json → projects[cwd].mcpServers (local scope).
  // We must register once per working directory the user starts Claude from.

  const proxySource = path.resolve(__dirname, 'mcp-stdio-proxy.js');
  if (!fs.existsSync(proxySource)) {
    console.log(`  ✗ Proxy source not found: ${proxySource}`);
    console.log(`  Make sure you are running this from the priority-forge repo directory.`);
    return false;
  }

  // Install proxy to stable XDG location (path survives repo moves)
  fs.mkdirSync(PROXY_INSTALL_DIR, { recursive: true });
  fs.copyFileSync(proxySource, PROXY_INSTALL_PATH);
  console.log(`  ✓ Proxy installed to: ${PROXY_INSTALL_PATH}`);

  const claudeJsonPath = path.join(HOME, '.claude.json');

  // Remove any stale user-scope registration (top-level mcpServers — not loaded by sessions)
  const globalCfg = readJsonFile(claudeJsonPath);
  if (globalCfg?.mcpServers?.['priority-forge']) {
    try {
      execSync(`claude mcp remove --scope user priority-forge 2>/dev/null || true`, { stdio: 'pipe', shell: true });
      console.log(`  ✓ Removed stale user-scope registration (was not loaded by sessions)`);
    } catch { /* ignore */ }
  }

  // Determine which directories to register in.
  // Must include: HOME, Desktop, current working directory, and any other known project dirs.
  const dirsToRegister = new Set<string>();
  dirsToRegister.add(HOME);
  dirsToRegister.add(path.join(HOME, 'Desktop'));
  dirsToRegister.add(process.cwd());

  // Also register in all directories already known to Claude Code (from ~/.claude.json)
  const updated = readJsonFile(claudeJsonPath);
  const knownProjects = Object.keys(updated?.projects || {});
  for (const dir of knownProjects) {
    if (fs.existsSync(dir) && dir !== path.join(HOME, '.claude')) {
      dirsToRegister.add(dir);
    }
  }

  let registered = 0;
  let skipped = 0;

  for (const dir of dirsToRegister) {
    if (!fs.existsSync(dir)) continue;

    // Check if already correctly registered for this dir
    const cfg = readJsonFile(claudeJsonPath);
    const existing = cfg?.projects?.[dir]?.mcpServers?.['priority-forge'];
    if (existing?.command === 'node' &&
        Array.isArray(existing?.args) &&
        existing.args.includes(PROXY_INSTALL_PATH)) {
      console.log(`  ✓ Already registered in: ${dir}`);
      skipped++;
      continue;
    }

    // Remove stale entry for this dir if present
    if (existing) {
      try {
        execSync(`claude mcp remove priority-forge 2>/dev/null || true`, { stdio: 'pipe', shell: true, cwd: dir });
      } catch { /* ignore */ }
    }

    try {
      execSync(
        `claude mcp add priority-forge -- node ${PROXY_INSTALL_PATH}`,
        { stdio: 'pipe', cwd: dir }
      );
      console.log(`  ✓ Registered in: ${dir}`);
      registered++;
    } catch (err: any) {
      console.log(`  ✗ Failed for ${dir}: ${err.message}`);
    }
  }

  if (registered === 0 && skipped === 0) {
    console.log(`  ✗ Failed to register in any directory.`);
    console.log(`  Manual fix (run from each directory you start Claude from):`);
    console.log(`    claude mcp add priority-forge -- node ${PROXY_INSTALL_PATH}`);
    return false;
  }

  console.log(`  ✓ Registered in ${registered} director${registered === 1 ? 'y' : 'ies'}, ${skipped} already up to date`);
  cleanLegacyMcpJson();
  return true;
}

function cleanLegacyMcpJson(): void {
  const legacyPath = path.join(HOME, '.claude', 'mcp.json');
  if (!fs.existsSync(legacyPath)) return;
  const legacy = readJsonFile(legacyPath);
  const keys = Object.keys(legacy?.mcpServers || {});
  if (keys.length === 1 && keys[0] === 'priority-forge') {
    fs.unlinkSync(legacyPath);
    console.log(`  ✓ Removed legacy ~/.claude/mcp.json (superseded by user-scope stdio registration)`);
  } else if (keys.includes('priority-forge')) {
    delete legacy.mcpServers['priority-forge'];
    fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
    console.log(`  ✓ Removed priority-forge from legacy ~/.claude/mcp.json`);
  }
}

function configureMCP(tool: ToolConfig): boolean {
  // Claude Code uses a different registration mechanism
  if (tool.name === 'Claude Code CLI') {
    return configureMCPClaudeCode();
  }

  console.log(`\n  Configuring MCP for ${tool.name}...`);

  ensureDirectoryExists(tool.mcpConfigPath);

  const existingConfig = readJsonFile(tool.mcpConfigPath);
  const newConfig = tool.mcpConfigFormat(SERVER_URL);

  // Check if already configured
  if (existingConfig?.mcpServers?.['priority-forge']) {
    const existingUrl = existingConfig.mcpServers['priority-forge'].url;
    if (existingUrl === SERVER_URL) {
      console.log('  MCP already configured (skipping)');
      return true;
    }
    console.log(`  Updating existing MCP config (was: ${existingUrl})`);
  }

  const mergedConfig = mergeMCPConfig(existingConfig, newConfig);

  fs.writeFileSync(tool.mcpConfigPath, JSON.stringify(mergedConfig, null, 2));
  console.log(`  ✓ MCP config written to: ${tool.mcpConfigPath}`);

  return true;
}

function configureAgentRules(tool: ToolConfig): boolean {
  console.log(`\n  Configuring agent rules for ${tool.name}...`);
  
  if (!fs.existsSync(AGENT_RULES_SOURCE)) {
    console.log(`  ✗ Agent rules source not found: ${AGENT_RULES_SOURCE}`);
    return false;
  }
  
  const agentRulesContent = fs.readFileSync(AGENT_RULES_SOURCE, 'utf-8');
  const markerStart = '<!-- PRIORITY_FORGE_START -->';
  const markerEnd = '<!-- PRIORITY_FORGE_END -->';
  const wrappedContent = `${markerStart}\n${tool.agentRulesHeader}${agentRulesContent}\n${markerEnd}`;
  
  ensureDirectoryExists(tool.agentRulesPath);
  
  if (fs.existsSync(tool.agentRulesPath)) {
    const existingContent = fs.readFileSync(tool.agentRulesPath, 'utf-8');
    
    // Check if our content is already there
    if (existingContent.includes(markerStart)) {
      // Replace existing Priority Forge section
      const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g');
      const updatedContent = existingContent.replace(regex, wrappedContent);
      fs.writeFileSync(tool.agentRulesPath, updatedContent);
      console.log('  ✓ Agent rules updated (replaced existing section)');
    } else {
      // Append to existing file
      const updatedContent = existingContent + '\n\n' + wrappedContent;
      fs.writeFileSync(tool.agentRulesPath, updatedContent);
      console.log('  ✓ Agent rules appended to existing file');
    }
  } else {
    // Create new file
    fs.writeFileSync(tool.agentRulesPath, wrappedContent);
    console.log(`  ✓ Agent rules created: ${tool.agentRulesPath}`);
  }
  
  return true;
}

function migrateAgentsMd(): void {
  // Claude Code used to write to AGENTS.md but now reads CLAUDE.md.
  // If AGENTS.md exists with Priority Forge content but CLAUDE.md doesn't, migrate it.
  const agentsPath = path.join(HOME, '.claude', 'AGENTS.md');
  const claudePath = path.join(HOME, '.claude', 'CLAUDE.md');
  const marker = '<!-- PRIORITY_FORGE_START -->';

  if (fs.existsSync(agentsPath) && !fs.existsSync(claudePath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    if (content.includes(marker)) {
      fs.writeFileSync(claudePath, content);
      console.log('  ✓ Migrated Priority Forge rules from AGENTS.md → CLAUDE.md');
    }
  }
}

async function main() {
  migrateAgentsMd();

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│     MCP Configuration                   │');
  console.log('└─────────────────────────────────────────┘\n');
  
  console.log('Which AI tool do you use?\n');
  console.log('  [1] Cursor');
  console.log('  [2] Droid (Factory CLI)');
  console.log('  [3] Claude Code CLI');
  console.log('');
  
  let choice = '';
  while (!TOOLS[choice]) {
    choice = await question('Enter choice (1-3): ');
    if (!TOOLS[choice]) {
      console.log('Invalid choice. Please enter 1, 2, or 3.');
    }
  }
  
  const tool = TOOLS[choice];
  console.log(`\nConfiguring for ${tool.name}...`);
  
  const mcpSuccess = configureMCP(tool);
  const agentSuccess = configureAgentRules(tool);
  
  if (mcpSuccess && agentSuccess) {
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  ✓ Configuration complete!              │');
    console.log('└─────────────────────────────────────────┘\n');
    if (tool.name === 'Claude Code CLI') {
      console.log(`MCP Config:    ~/.claude.json → projects[cwd].mcpServers (local scope, per working dir)`);
    } else {
      console.log(`MCP Config:    ${tool.mcpConfigPath}`);
    }
    console.log(`Agent Rules:   ${tool.agentRulesPath}`);
    console.log(`Server URL:    ${SERVER_URL}`);
    console.log('\nIMPORTANT: Restart ' + tool.name + ' for changes to take effect.\n');
  } else {
    console.log('\n⚠ Configuration completed with warnings. Check messages above.');
  }
  
  rl.close();
}

main().catch((err) => {
  console.error('Error:', err);
  rl.close();
  process.exit(1);
});
