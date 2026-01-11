#!/usr/bin/env npx tsx

// Interactive MCP configuration script
// Configures MCP server connection + agent rules for Cursor, Droid, or Claude Code

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';

const HOME = os.homedir();

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
    mcpConfigPath: path.join(HOME, '.claude', 'mcp.json'),
    agentRulesPath: path.join(HOME, '.claude', 'AGENTS.md'),
    mcpConfigFormat: (url: string) => ({
      mcpServers: {
        'priority-forge': { type: 'http', url }
      }
    }),
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

function configureMCP(tool: ToolConfig): boolean {
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

async function main() {
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
    console.log(`MCP Config:    ${tool.mcpConfigPath}`);
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
