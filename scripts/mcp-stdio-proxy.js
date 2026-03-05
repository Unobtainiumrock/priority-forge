#!/usr/bin/env node
// MCP stdio-to-HTTP proxy for Priority Forge
//
// Claude Code uses stdio as the most reliable transport for main-session MCP tools.
// This proxy bridges Claude Code's stdio transport to the Priority Forge HTTP server,
// allowing the server to remain a persistent systemd service while Claude Code
// interacts with it via subprocess stdio (the universally supported MCP transport).
//
// Usage (registered via `claude mcp add --scope user`):
//   claude mcp add --scope user priority-forge -- node /path/to/scripts/mcp-stdio-proxy.js
//
// Protocol:
//   stdin  ← Content-Length framed JSON-RPC messages from Claude Code
//   stdout → Content-Length framed JSON-RPC responses back to Claude Code

'use strict';

const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3456;
const SERVER_PATH = '/mcp';

let inputBuffer = Buffer.alloc(0);
let sessionId = null;
let pendingRequests = 0;
let stdinEnded = false;

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  stdinEnded = true;
  // Don't exit yet — wait for any in-flight HTTP requests to complete
  maybeExit();
});

function maybeExit() {
  if (stdinEnded && pendingRequests === 0) {
    process.exit(0);
  }
}

function processBuffer() {
  while (true) {
    // MCP stdio framing: "Content-Length: N\r\n\r\n" followed by N bytes of JSON
    const headerEnd = inputBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = inputBuffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Malformed header — drop and try to resync
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;

    if (inputBuffer.length < bodyStart + contentLength) {
      // Not enough data yet — wait for more
      break;
    }

    const body = inputBuffer.slice(bodyStart, bodyStart + contentLength);
    inputBuffer = inputBuffer.slice(bodyStart + contentLength);

    forwardToHTTP(body);
  }
}

function forwardToHTTP(body) {
  const bodyStr = body.toString('utf8');

  const reqHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
  };

  if (sessionId) {
    reqHeaders['Mcp-Session-Id'] = sessionId;
  }

  pendingRequests++;

  const req = http.request(
    {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: SERVER_PATH,
      method: 'POST',
      headers: reqHeaders,
    },
    (res) => {
      // Capture session ID returned on initialize
      if (res.headers['mcp-session-id']) {
        sessionId = res.headers['mcp-session-id'];
      }

      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        pendingRequests--;
        const trimmed = responseBody.trim();
        if (trimmed) {
          writeToStdout(trimmed);
        }
        // 202 Accepted (notifications/responses only) produces no body — that's fine
        maybeExit();
      });
    }
  );

  req.on('error', (err) => {
    pendingRequests--;
    const isConnRefused = err.code === 'ECONNREFUSED';
    const message = isConnRefused
      ? `Priority Forge backend not running on port ${SERVER_PORT}. Start it with: systemctl --user start priority-forge-backend`
      : `Proxy error: ${err.message}`;

    // Try to extract the id from the original message for a proper error response
    let id = null;
    try {
      const parsed = JSON.parse(bodyStr);
      id = parsed.id ?? null;
    } catch { /* ignore */ }

    const errorResponse = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message },
    });
    writeToStdout(errorResponse);
    maybeExit();
  });

  req.write(bodyStr);
  req.end();
}

function writeToStdout(jsonStr) {
  const encoded = Buffer.from(jsonStr, 'utf8');
  const frame = `Content-Length: ${encoded.length}\r\n\r\n`;
  process.stdout.write(frame);
  process.stdout.write(encoded);
}

// Keep process alive while stdin is open
process.stdin.resume();
