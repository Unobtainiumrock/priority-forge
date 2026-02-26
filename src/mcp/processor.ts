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

import { JsonRpcMessage, McpProcessor } from './streamableHandler';
import { VERSION, VERSION_TAG } from '../version';

// Import the existing handlers from handler.ts
// We'll need to export these functions from handler.ts
let handleToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
let handleResourceRead: (uri: string) => Promise<string>;
let handlePromptGet: (name: string, args: Record<string, string>) => Promise<unknown>;
let getTools: () => unknown[];
let getResources: () => unknown[];
let getPrompts: () => unknown[];

export function setHandlers(handlers: {
  handleToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  handleResourceRead: (uri: string) => Promise<string>;
  handlePromptGet: (name: string, args: Record<string, string>) => Promise<unknown>;
  getTools: () => unknown[];
  getResources: () => unknown[];
  getPrompts: () => unknown[];
}) {
  handleToolCall = handlers.handleToolCall;
  handleResourceRead = handlers.handleResourceRead;
  handlePromptGet = handlers.handlePromptGet;
  getTools = handlers.getTools;
  getResources = handlers.getResources;
  getPrompts = handlers.getPrompts;
}

export class McpMessageProcessor implements McpProcessor {
  async processMessage(message: JsonRpcMessage, sessionId?: string): Promise<JsonRpcMessage> {
    const response: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: message.id,
    };

    try {
      switch (message.method) {
        case 'initialize':
          response.result = {
            protocolVersion: '2025-03-26', // Updated to latest protocol
            capabilities: {
              tools: {},
              resources: {
                subscribe: false,
                listChanged: false,
              },
              prompts: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'priority-forge',
              version: VERSION,
            },
            instructions: `You are connected to a task prioritization system (Priority Forge ${VERSION_TAG}).

## MANDATORY STARTUP SEQUENCE
1. Read 'progress://current-focus' - understand top priority
2. Read 'progress://auto-capture' - learn to proactively identify tasks
3. Read 'progress://project-registry' - check if current project is registered

## CRITICAL: WORK DURATION TRACKING (V4.0)
When starting work on ANY task, you MUST call BOTH:
1. \`log_task_selection(taskId)\` - logs which task was selected
2. \`update_task(id, status: "in_progress")\` - captures startedAt timestamp

This enables ML to learn actual work duration vs queue time. Without this, we lose valuable training data.

## DURING CONVERSATION
- Proactively identify tasks from user's descriptions (don't wait for "add a task")
- Call 'suggest_tasks' when user describes work items
- Update task status as work progresses
- Log context switches when changing topics

## ON NEW PROJECT
- Call 'create_project' to register untracked directories

## END OF CONVERSATION
- Update all in-progress tasks
- Call 'complete_task' for finished work (captures actualWorkTime)
- Review conversation for untracked tasks`,
          };
          break;

        case 'tools/list':
          response.result = { tools: getTools() };
          break;

        case 'tools/call': {
          const { name, arguments: args } = message.params as {
            name: string;
            arguments: Record<string, unknown>;
          };
          const result = await handleToolCall(name, args || {});

          const protocolReminder = `\n\n---\n📋 Remember: Update task status when done. Call complete_task with outcome.`;

          response.result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2) + protocolReminder,
              },
            ],
          };
          break;
        }

        case 'resources/list':
          response.result = { resources: getResources() };
          break;

        case 'resources/read': {
          const { uri } = message.params as { uri: string };
          const content = await handleResourceRead(uri);
          const resources = getResources() as Array<{ uri: string; mimeType: string }>;
          response.result = {
            contents: [
              {
                uri,
                mimeType: resources.find(r => r.uri === uri)?.mimeType || 'text/plain',
                text: content,
              },
            ],
          };
          break;
        }

        case 'prompts/list':
          response.result = { prompts: getPrompts() };
          break;

        case 'prompts/get': {
          const { name, arguments: promptArgs } = message.params as {
            name: string;
            arguments?: Record<string, string>;
          };
          const promptResult = await handlePromptGet(name, promptArgs || {});
          response.result = promptResult;
          break;
        }

        default:
          response.error = {
            code: -32601,
            message: `Method not found: ${message.method}`,
          };
      }
    } catch (error) {
      response.error = {
        code: -32000,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    return response;
  }
}

export const mcpProcessor = new McpMessageProcessor();
