/*
 * Priority Forge - Cross-project task prioritization
 * Copyright (C) 2026 Priority Forge Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Request, Response } from 'express';
import { sessionManager } from './sessionManager';

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// SSE helper to format messages
function formatSSEMessage(data: JsonRpcMessage, eventId?: number): string {
  let message = '';
  if (eventId !== undefined) {
    message += `id: ${eventId}\n`;
  }
  message += `data: ${JSON.stringify(data)}\n\n`;
  return message;
}

// Check if client accepts SSE
function acceptsSSE(req: Request): boolean {
  const accept = req.headers.accept || '';
  return accept.includes('text/event-stream');
}

// Check if client accepts JSON
function acceptsJSON(req: Request): boolean {
  const accept = req.headers.accept || '';
  return accept.includes('application/json') || accept.includes('*/*');
}

// Check if message contains requests (vs only responses/notifications)
function containsRequests(messages: JsonRpcMessage[]): boolean {
  return messages.some(msg => msg.method && msg.id !== undefined && msg.id !== null);
}

// Check if message is only responses or notifications
function isResponseOrNotificationOnly(messages: JsonRpcMessage[]): boolean {
  return messages.every(msg =>
    // Either a response (has result/error, no method)
    (msg.result !== undefined || msg.error !== undefined) ||
    // Or a notification (has method, but id is null or undefined)
    (msg.method && (msg.id === null || msg.id === undefined))
  );
}

export interface McpProcessor {
  processMessage(message: JsonRpcMessage, sessionId?: string): Promise<JsonRpcMessage>;
}

export function createStreamableHandler(processor: McpProcessor) {
  return async function streamableHandler(req: Request, res: Response): Promise<void> {
    // Handle GET requests (open SSE stream for server-initiated messages)
    if (req.method === 'GET') {
      // Check if client accepts SSE
      if (!acceptsSSE(req)) {
        res.status(406).json({ error: 'Client must accept text/event-stream' });
        return;
      }

      // Check session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && !sessionManager.isValid(sessionId)) {
        res.status(404).json({ error: 'Session not found or expired' });
        return;
      }

      // Open SSE stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Keep connection alive with periodic comments
      const keepAliveInterval = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);

      // Clean up on disconnect
      req.on('close', () => {
        clearInterval(keepAliveInterval);
      });

      return;
    }

    // Handle POST requests (send messages to server)
    if (req.method === 'POST') {
      const body = req.body;

      // Validate JSON-RPC version
      const messages = Array.isArray(body) ? body : [body];
      for (const msg of messages) {
        if (msg.jsonrpc !== '2.0') {
          res.status(400).json({ error: 'Invalid JSON-RPC version' });
          return;
        }
      }

      // Handle session management
      let sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Check if this is an initialize request
      const isInitialize = messages.some(msg => msg.method === 'initialize');

      if (!isInitialize && sessionId && !sessionManager.isValid(sessionId)) {
        res.status(404).json({ error: 'Session not found or expired' });
        return;
      }

      // Validate Accept header for requests
      if (!acceptsJSON(req) && !acceptsSSE(req)) {
        res.status(406).json({ error: 'Client must accept application/json or text/event-stream' });
        return;
      }

      // Process messages
      const responses: JsonRpcMessage[] = [];
      for (const message of messages) {
        try {
          const response = await processor.processMessage(message, sessionId);

          // Create session on initialize
          if (message.method === 'initialize' && !sessionId) {
            sessionId = sessionManager.createSession();
            sessionManager.markInitialized(sessionId);
          }

          responses.push(response);
        } catch (error) {
          responses.push({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      }

      // If only responses/notifications, return 202 Accepted
      if (isResponseOrNotificationOnly(messages)) {
        res.status(202).end();
        return;
      }

      // If contains requests, decide between JSON or SSE based on Accept header
      const preferSSE = acceptsSSE(req);

      if (preferSSE) {
        // Return SSE stream
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...(sessionId && { 'Mcp-Session-Id': sessionId }),
        });

        let eventId = 0;
        for (const response of responses) {
          res.write(formatSSEMessage(response, eventId++));
        }

        res.end();
      } else {
        // Set session ID header on initialize before sending response
        if (sessionId && isInitialize) {
          res.setHeader('Mcp-Session-Id', sessionId);
        }

        // Return JSON response
        const response = responses.length === 1 ? responses[0] : responses;
        res.json(response);
      }

      return;
    }

    // Handle DELETE (terminate session)
    if (req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId) {
        sessionManager.deleteSession(sessionId);
        res.status(204).end();
      } else {
        res.status(400).json({ error: 'Missing Mcp-Session-Id header' });
      }
      return;
    }

    // Unsupported method
    res.status(405).json({ error: 'Method not allowed' });
  };
}
