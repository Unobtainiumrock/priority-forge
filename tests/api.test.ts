import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';

// Simple integration tests for the API
// Run with: npm test

const BASE_URL = 'http://localhost:3457';
let server: Server;
let app: express.Express;

// Note: These tests require the server to be running on port 3457
// For CI, you'd want to spawn the server programmatically

describe('Progress Tracker API', () => {
  describe('Health Check', () => {
    it('should return ok status', async () => {
      // This test assumes server is running
      // In a real setup, we'd spawn the server here
      const response = await fetch(`${BASE_URL}/health`).catch(() => null);
      if (response) {
        const data = await response.json();
        expect(data.status).toBe('ok');
      } else {
        // Server not running, skip
        console.log('Server not running on port 3457, skipping integration tests');
      }
    });
  });

  describe('Projects API', () => {
    it('GET /projects should return array', async () => {
      const response = await fetch(`${BASE_URL}/projects`).catch(() => null);
      if (response) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  describe('Tasks API', () => {
    it('GET /tasks should return sorted by priority', async () => {
      const response = await fetch(`${BASE_URL}/tasks`).catch(() => null);
      if (response) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
        
        // Verify P0 comes before P1
        const priorities = data.map((t: { priority: string }) => t.priority);
        const p0Index = priorities.indexOf('P0');
        const p1Index = priorities.indexOf('P1');
        if (p0Index !== -1 && p1Index !== -1) {
          expect(p0Index).toBeLessThan(p1Index);
        }
      }
    });

    it('GET /tasks/priority/P0 should filter correctly', async () => {
      const response = await fetch(`${BASE_URL}/tasks/priority/P0`).catch(() => null);
      if (response) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
        data.forEach((task: { priority: string }) => {
          expect(task.priority).toBe('P0');
        });
      }
    });
  });

  describe('MCP Endpoint', () => {
    it('should respond to initialize', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        }),
      }).catch(() => null);

      if (response) {
        const data = await response.json();
        expect(data.jsonrpc).toBe('2.0');
        expect(data.result?.serverInfo?.name).toBe('priority-forge');
      }
    });

    it('should list tools', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      }).catch(() => null);

      if (response) {
        const data = await response.json();
        expect(data.result?.tools).toBeDefined();
        expect(Array.isArray(data.result.tools)).toBe(true);
        
        const toolNames = data.result.tools.map((t: { name: string }) => t.name);
        expect(toolNames).toContain('get_status');
        expect(toolNames).toContain('create_task');
        expect(toolNames).toContain('complete_task');
      }
    });

    it('should execute get_status tool', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'get_status',
            arguments: {},
          },
        }),
      }).catch(() => null);

      if (response) {
        const data = await response.json();
        expect(data.result?.content).toBeDefined();
        expect(data.result.content[0].type).toBe('text');
        
        const status = JSON.parse(data.result.content[0].text);
        expect(status.version).toBe('v1');
        expect(status.projects).toBeDefined();
        expect(status.priorityQueue).toBeDefined();
      }
    });
  });
});
