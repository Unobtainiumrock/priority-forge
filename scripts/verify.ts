#!/usr/bin/env npx tsx

// Verification script to test Priority Forge setup
// Checks: server connectivity, MCP endpoint, database

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const SERVER_URL = 'http://localhost:3456';
const DATA_FILE = path.join(__dirname, '..', 'data', 'progress.json');

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
