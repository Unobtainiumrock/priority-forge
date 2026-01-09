import { Request, Response } from 'express';
import { storage } from '../storage/jsonStorage';

// MCP Protocol: JSON-RPC 2.0 based
// See: https://modelcontextprotocol.io/docs/concepts/architecture

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Tool definitions
const tools = [
  {
    name: 'get_status',
    description: 'Get full system status including all projects, tasks, data gaps, and decisions',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_priorities',
    description: 'Get all tasks sorted by priority (P0 first)',
    inputSchema: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: 'Filter by specific priority level',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_project',
    description: 'Get details for a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Project name (alternative to ID)' },
      },
      required: [],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the priority queue',
    inputSchema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        task: { type: 'string', description: 'Task description' },
        project: { type: 'string', description: 'Project ID or name' },
        blocking: { type: 'string', description: 'What this task blocks' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['priority', 'task', 'project'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'complete', 'blocked', 'waiting'] },
        task: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as complete with outcome tracking',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        outcome: { type: 'string', enum: ['completed', 'cancelled', 'deferred'] },
      },
      required: ['id', 'outcome'],
    },
  },
  {
    name: 'log_context_switch',
    description: 'Log that user switched away from a task (for V3 training data)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID being switched from' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_data_gaps',
    description: 'Get all identified data collection gaps',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'log_decision',
    description: 'Log an architectural or design decision',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Decision date (YYYY-MM-DD)' },
        decision: { type: 'string', description: 'What was decided' },
        rationale: { type: 'string', description: 'Why it was decided' },
      },
      required: ['date', 'decision', 'rationale'],
    },
  },
];

async function handleToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_status': {
      const db = await storage.getAll();
      return {
        version: db.version,
        lastUpdated: db.lastUpdated,
        projects: db.projects,
        priorityQueue: await storage.getTasks(),
        dataGaps: db.dataGaps,
        decisions: db.decisions,
      };
    }

    case 'get_priorities': {
      if (params.priority) {
        return storage.getTasksByPriority(params.priority as 'P0' | 'P1' | 'P2' | 'P3');
      }
      return storage.getTasks();
    }

    case 'get_project': {
      if (params.id) {
        return storage.getProject(params.id as string);
      }
      if (params.name) {
        const projects = await storage.getProjects();
        return projects.find(p => p.name === params.name) || null;
      }
      return { error: 'Provide id or name' };
    }

    case 'create_task': {
      return storage.createTask({
        priority: params.priority as 'P0' | 'P1' | 'P2' | 'P3',
        task: params.task as string,
        project: params.project as string,
        blocking: params.blocking as string | undefined,
        notes: params.notes as string | undefined,
      });
    }

    case 'update_task': {
      const { id, ...updates } = params;
      return storage.updateTask(id as string, updates);
    }

    case 'complete_task': {
      return storage.completeTask(
        params.id as string,
        params.outcome as 'completed' | 'cancelled' | 'deferred'
      );
    }

    case 'log_context_switch': {
      await storage.logContextSwitch(params.taskId as string);
      return { success: true, taskId: params.taskId };
    }

    case 'get_data_gaps': {
      return storage.getDataGaps();
    }

    case 'log_decision': {
      return storage.createDecision({
        date: params.date as string,
        decision: params.decision as string,
        rationale: params.rationale as string,
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function mcpHandler(req: Request, res: Response): Promise<void> {
  const rpcReq = req.body as JsonRpcRequest;

  if (rpcReq.jsonrpc !== '2.0') {
    res.status(400).json({ error: 'Invalid JSON-RPC version' });
    return;
  }

  const response: JsonRpcResponse = {
    jsonrpc: '2.0',
    id: rpcReq.id,
  };

  try {
    switch (rpcReq.method) {
      case 'initialize':
        response.result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'progress-tracker',
            version: '1.0.0',
          },
        };
        break;

      case 'tools/list':
        response.result = { tools };
        break;

      case 'tools/call': {
        const { name, arguments: args } = rpcReq.params as {
          name: string;
          arguments: Record<string, unknown>;
        };
        const result = await handleToolCall(name, args || {});
        response.result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
        break;
      }

      default:
        response.error = {
          code: -32601,
          message: `Method not found: ${rpcReq.method}`,
        };
    }
  } catch (error) {
    response.error = {
      code: -32000,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  res.json(response);
}
