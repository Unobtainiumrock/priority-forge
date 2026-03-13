#!/usr/bin/env node
// MCP stdio-to-HTTP proxy for Priority Forge
//
// Bridges Claude Code's stdio MCP transport to the Priority Forge HTTP server.
// The server runs as a persistent systemd/launchd service; this proxy is spawned
// by Claude Code as a subprocess on session start.
//
// This file is installed to ~/.local/share/priority-forge/mcp-proxy.js during
// `npm run setup:mcp` so the registered path stays valid even if the repo moves.
//
// Protocol routing:
//   Client requests 2025-11-25 → POST /mcp       (latest spec, Claude Code 2.1.74+)
//   Client requests 2025-03-26 → POST /mcp       (Streamable HTTP, full spec)
//   Client requests 2024-11-05 → POST /mcp/legacy (older spec)
//   Client version unknown     → POST /mcp/legacy (safe default)
//
// Framing auto-detection:
//   Content-Length framing: "Content-Length: N\r\n\r\nJSON"  (MCP spec)
//   Newline-delimited JSON: "JSON\n"  (Claude Code 2.1.74+)

'use strict';

const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3456;

// Map protocol versions to server endpoints
const ENDPOINTS = {
  '2025-11-25': '/mcp',
  '2025-03-26': '/mcp',
  '2024-11-05': '/mcp/legacy',
};
const DEFAULT_PATH = '/mcp'; // default to current endpoint

// Determined on first initialize request; all subsequent requests use the same path
let serverPath = DEFAULT_PATH;

let inputBuffer = Buffer.alloc(0);
let sessionId = null;
let pendingRequests = 0;
let stdinEnded = false;
// Auto-detected from first message: 'content-length' or 'newline'
let framingMode = null;

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
  // Auto-detect framing mode from the first bytes we receive
  if (!framingMode && inputBuffer.length > 0) {
    framingMode = inputBuffer[0] === 0x7B /* '{' */ ? 'newline' : 'content-length';
  }

  if (framingMode === 'newline') {
    processNewlineDelimited();
  } else {
    processContentLength();
  }
}

function processNewlineDelimited() {
  while (true) {
    const newlineIdx = inputBuffer.indexOf('\n');
    if (newlineIdx === -1) break;

    const line = inputBuffer.slice(0, newlineIdx).toString('utf8').trim();
    inputBuffer = inputBuffer.slice(newlineIdx + 1);

    if (line.length === 0) continue;
    dispatchMessage(Buffer.from(line, 'utf8'));
  }
}

function processContentLength() {
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

    dispatchMessage(body);
  }
}

function dispatchMessage(body) {
  const bodyStr = body.toString('utf8');

  let msg;
  try { msg = JSON.parse(bodyStr); } catch { /* malformed — forward anyway */ }

  // Notifications: messages with a method but no id.
  // By MCP spec these are fire-and-forget — no response is expected.
  // Do NOT forward to the HTTP backend: legacy endpoint incorrectly returns
  // "Method not found" errors for them, which breaks the client handshake.
  if (msg && msg.method && msg.id === undefined) {
    // Nothing to send back, nothing to track
    maybeExit();
    return;
  }

  forwardToHTTP(body);
}

function forwardToHTTP(body) {
  const bodyStr = body.toString('utf8');

  // On initialize, determine which server endpoint to use based on client's
  // requested protocol version. This is set once and used for the session.
  try {
    const msg = JSON.parse(bodyStr);
    if (msg.method === 'initialize') {
      const clientVersion = msg.params?.protocolVersion;
      serverPath = ENDPOINTS[clientVersion] || DEFAULT_PATH;
    }
  } catch { /* non-JSON or non-initialize — ignore */ }

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
      path: serverPath,
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
  if (framingMode === 'newline') {
    process.stdout.write(jsonStr + '\n');
  } else {
    const encoded = Buffer.from(jsonStr, 'utf8');
    const frame = `Content-Length: ${encoded.length}\r\n\r\n`;
    process.stdout.write(frame);
    process.stdout.write(encoded);
  }
}

// Keep process alive while stdin is open
process.stdin.resume();
