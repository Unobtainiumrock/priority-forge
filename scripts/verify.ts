#!/usr/bin/env npx tsx

// Verification script to test Priority Forge setup
// Checks: server connectivity, MCP endpoint, database

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';

const SERVER_URL = 'http://localhost:3456';
const DATA_FILE = path.join(__dirname, '..', 'data', 'progress.json');
const HOME = os.homedir();
// MCP is registered via .mcp.json files in each working directory.
// Trust is pre-accepted by writing enabledMcpjsonServers to ~/.claude.json.
const CLAUDE_JSON = path.join(HOME, '.claude.json');
const CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md');
const AGENTS_MD = path.join(HOME, '.claude', 'AGENTS.md'); // legacy - should have been migrated
const IS_LINUX = os.platform() === 'linux';
// Stable proxy install location (independent of repo path)
const PROXY_INSTALL_PATH = os.platform() === 'darwin'
  ? path.join(HOME, 'Library', 'Application Support', 'priority-forge', 'mcp-proxy.js')
  : path.join(HOME, '.local', 'share', 'priority-forge', 'mcp-proxy.js');

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message });
  const icon = passed ? '✓' : '✗';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}${icon}\x1b[0m ${name}: ${message}`);
}

async function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function httpPost(url: string, data: any): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const urlObj = new URL(url);
    
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│     Verifying Priority Forge Setup      │');
  console.log('└─────────────────────────────────────────┘\n');
  
  // Check 0: MCP client config via .mcp.json + enabledMcpjsonServers
  // Claude Code discovers .mcp.json files in the working directory.
  // Trust is pre-accepted via enabledMcpjsonServers in ~/.claude.json.
  // We check the Desktop directory since that's the most common session working directory.
  const desktopDir = path.join(HOME, 'Desktop');
  const desktopMcpJson = path.join(desktopDir, '.mcp.json');

  // Check .mcp.json presence and content
  if (fs.existsSync(desktopMcpJson)) {
    try {
      const mcpJson = JSON.parse(fs.readFileSync(desktopMcpJson, 'utf-8'));
      const entry = mcpJson?.['priority-forge'];
      if (entry?.command === 'node' && Array.isArray(entry?.args) && entry.args.includes(PROXY_INSTALL_PATH)) {
        check('MCP .mcp.json (Desktop)', true, `~/Desktop/.mcp.json → ${PROXY_INSTALL_PATH}`);
      } else {
        check('MCP .mcp.json (Desktop)', false,
          `unexpected format: ${JSON.stringify(entry)} - run: npm run setup:mcp`);
      }
    } catch {
      check('MCP .mcp.json (Desktop)', false, '~/Desktop/.mcp.json is malformed JSON');
    }
  } else {
    check('MCP .mcp.json (Desktop)', false,
      `~/Desktop/.mcp.json not found - run: npm run setup:mcp`);
  }

  // Check trust pre-acceptance in ~/.claude.json
  if (fs.existsSync(CLAUDE_JSON)) {
    try {
      const claudeCfg = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf-8'));

      // Warn if stale user-scope entry still exists
      if (claudeCfg?.mcpServers?.['priority-forge']) {
        check('MCP user-scope (stale)', false,
          'priority-forge in top-level mcpServers — this scope is NOT loaded by Claude Code. Run: npm run setup:mcp');
      }

      // Check trust pre-acceptance for Desktop
      const desktopEnabled: string[] = claudeCfg?.projects?.[desktopDir]?.enabledMcpjsonServers || [];
      if (desktopEnabled.includes('priority-forge')) {
        check('MCP trust (Desktop)', true, 'priority-forge pre-accepted in enabledMcpjsonServers');
      } else {
        check('MCP trust (Desktop)', false,
          'priority-forge not in enabledMcpjsonServers for Desktop — run: npm run setup:mcp');
      }

      // Show coverage: dirs with both .mcp.json and trust pre-accepted
      const projects = claudeCfg?.projects || {};
      const trusted = Object.entries(projects).filter(([, proj]: [string, any]) => {
        const enabled: string[] = proj?.enabledMcpjsonServers || [];
        return enabled.includes('priority-forge');
      }).map(([dir]) => dir);
      if (trusted.length > 1) {
        check('MCP trust coverage', true, `pre-accepted in ${trusted.length} directories`);
      }
    } catch {
      check('MCP trust config', false, '~/.claude.json is malformed JSON');
    }
  } else {
    check('MCP trust config', false, '~/.claude.json not found - run: npm run setup:mcp');
  }

  // Check stable proxy install
  if (fs.existsSync(PROXY_INSTALL_PATH)) {
    const result = spawnSync('node', ['--check', PROXY_INSTALL_PATH], { encoding: 'utf-8' });
    check('MCP stdio proxy (installed)', result.status === 0, result.status === 0
      ? PROXY_INSTALL_PATH
      : `syntax error: ${result.stderr}`);
  } else {
    check('MCP stdio proxy (installed)', false,
      `${PROXY_INSTALL_PATH} not found — run: npm run setup:mcp`);
  }

  // Warn if legacy ~/.claude/mcp.json still exists (misleading — won't auto-load tools)
  const legacyMcpJson = path.join(HOME, '.claude', 'mcp.json');
  if (fs.existsSync(legacyMcpJson)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyMcpJson, 'utf-8'));
      if (legacy?.mcpServers?.['priority-forge']) {
        check('Legacy ~/.claude/mcp.json', false,
          'priority-forge still in ~/.claude/mcp.json (project-level, NOT auto-loaded) - run: npm run setup:mcp to migrate');
      }
    } catch { /* ignore malformed legacy file */ }
  }

  // Check 0b: Agent rules in CLAUDE.md (not AGENTS.md)
  const hasCLAUDEMd = fs.existsSync(CLAUDE_MD);
  const hasLegacyAgentsMd = fs.existsSync(AGENTS_MD);
  if (hasCLAUDEMd && fs.readFileSync(CLAUDE_MD, 'utf-8').includes('PRIORITY_FORGE_START')) {
    check('Agent rules (CLAUDE.md)', true, '~/.claude/CLAUDE.md contains Priority Forge rules');
    if (hasLegacyAgentsMd) {
      check('Agent rules (legacy)', true, 'AGENTS.md still exists but CLAUDE.md takes precedence - safe to delete AGENTS.md');
    }
  } else if (hasLegacyAgentsMd) {
    check('Agent rules (CLAUDE.md)', false,
      'Rules are in AGENTS.md (legacy) but Claude Code reads CLAUDE.md - run: npm run setup:mcp to migrate');
  } else {
    check('Agent rules (CLAUDE.md)', false, '~/.claude/CLAUDE.md not found - run: npm run setup:mcp');
  }

  // Check 0c: Systemd / launchd services
  if (IS_LINUX) {
    for (const svc of ['priority-forge-backend', 'priority-forge-frontend']) {
      try {
        const out = execSync(`systemctl --user is-active ${svc} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        check(`systemd: ${svc}`, out === 'active', out === 'active' ? 'active (auto-starts on boot)' : `status: ${out}`);
      } catch {
        check(`systemd: ${svc}`, false, 'not installed - run: bash scripts/install-systemd.sh install');
      }
    }
  } else {
    for (const svc of ['com.priority-forge.backend', 'com.priority-forge.frontend']) {
      try {
        const out = execSync(`launchctl list ${svc} 2>/dev/null`, { encoding: 'utf-8' });
        check(`launchd: ${svc}`, out.includes(svc), 'loaded');
      } catch {
        check(`launchd: ${svc}`, false, 'not loaded - run: ./setup.sh install-launchd');
      }
    }
  }

  // Check 1: Database file exists
  const dbExists = fs.existsSync(DATA_FILE);
  check('Database', dbExists, dbExists ? 'progress.json exists' : 'progress.json not found - run seed script');
  
  if (dbExists) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const projectCount = data.projects?.length || 0;
      const taskCount = data.tasks?.length || 0;
      check('Database content', true, `${projectCount} projects, ${taskCount} tasks`);
    } catch {
      check('Database content', false, 'Failed to parse progress.json');
    }
  }
  
  // Check 2: Server health endpoint
  let serverRunning = false;
  try {
    const healthRes = await httpGet(`${SERVER_URL}/health`);
    serverRunning = healthRes.status === 200;
    if (serverRunning) {
      const health = JSON.parse(healthRes.body);
      check('Server', true, `Running (v${health.version || 'unknown'})`);
    } else {
      check('Server', false, `Unexpected status: ${healthRes.status}`);
    }
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      check('Server', false, 'Not running - start with: npm run dev');
    } else {
      check('Server', false, `Error: ${err.message}`);
    }
  }
  
  // Check 3: MCP endpoint (only if server is running)
  if (serverRunning) {
    try {
      const mcpRes = await httpPost(`${SERVER_URL}/mcp`, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'verify-script', version: '1.0.0' }
        }
      });
      
      const mcpOk = mcpRes.status === 200;
      if (mcpOk) {
        const response = JSON.parse(mcpRes.body);
        if (response.result?.serverInfo) {
          check('MCP endpoint', true, `Protocol working (${response.result.serverInfo.name})`);
        } else if (response.error) {
          check('MCP endpoint', false, `Error: ${response.error.message}`);
        } else {
          check('MCP endpoint', true, 'Protocol responding');
        }
      } else {
        check('MCP endpoint', false, `Status: ${mcpRes.status}`);
      }
    } catch (err: any) {
      check('MCP endpoint', false, `Error: ${err.message}`);
    }
    
    // Check 4: REST API
    try {
      const statusRes = await httpGet(`${SERVER_URL}/status`);
      if (statusRes.status === 200) {
        check('REST API', true, '/status endpoint working');
      } else {
        check('REST API', false, `Status: ${statusRes.status}`);
      }
    } catch (err: any) {
      check('REST API', false, `Error: ${err.message}`);
    }
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;
  
  console.log('\n─────────────────────────────────────────');
  if (allPassed) {
    console.log(`\x1b[32m  All checks passed (${passed}/${total})\x1b[0m`);
  } else {
    console.log(`\x1b[33m  ${passed}/${total} checks passed\x1b[0m`);
    if (!serverRunning) {
      console.log('\n  To complete verification, start the server:');
      console.log('    npm run dev');
      console.log('\n  Then run verification again:');
      console.log('    npm run verify');
    }
  }
  console.log('');
  
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
