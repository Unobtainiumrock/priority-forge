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
import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage/jsonStorage';
import { VERSION, VERSION_TAG } from '../version';
import {
  TeamPulseSyncEmitter,
  TeamPulseSyncClient,
  loadTeamPulseConfig,
  updateTeamPulseConfig,
} from '../sync';

// MCP Protocol: JSON-RPC 2.0 based
// See: https://modelcontextprotocol.io/docs/concepts/architecture

// ── Team Pulse Sync ──
const tpConfig = loadTeamPulseConfig();
const syncEmitter = new TeamPulseSyncEmitter(tpConfig, 'default');
const syncClient = new TeamPulseSyncClient(tpConfig);

syncEmitter.on('sync_event', (event) => {
  syncClient.queueEvent(event);
});

if (tpConfig.enabled) {
  syncClient.start();
}

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

// ============================================================================
// MCP RESOURCES - Automatic context injection for ANY MCP client
// ============================================================================
const resources = [
  {
    uri: 'progress://current-focus',
    name: 'Current Focus & Top Priority',
    description: 'ALWAYS READ THIS FIRST. Shows the highest priority task and active work items. This context should guide every conversation.',
    mimeType: 'text/plain',
  },
  {
    uri: 'progress://task-protocol',
    name: 'Task Management Protocol',
    description: 'Required protocol for task lifecycle management. Read this to understand when and how to update tasks.',
    mimeType: 'text/plain',
  },
  {
    uri: 'progress://auto-capture',
    name: 'Automatic Task Capture Guidelines',
    description: 'CRITICAL: Guidelines for proactively identifying and capturing tasks from conversation WITHOUT user explicitly asking. Read this to ensure no work items slip through.',
    mimeType: 'text/plain',
  },
  {
    uri: 'progress://project-registry',
    name: 'Project Registry & Onboarding',
    description: 'List of known projects and onboarding flow for new projects. Check this when working in a new directory.',
    mimeType: 'text/plain',
  },
  {
    uri: 'progress://full-queue',
    name: 'Full Priority Queue',
    description: 'Complete list of all tasks sorted by computed priority score.',
    mimeType: 'application/json',
  },
];

async function handleResourceRead(uri: string): Promise<string> {
  switch (uri) {
    case 'progress://current-focus': {
      const topTask = await storage.getTopPriority();
      const allTasks = await storage.getTasks();
      const inProgress = allTasks.filter(t => t.status === 'in_progress');
      const blocked = allTasks.filter(t => t.status === 'blocked');
      
      let content = `# 🎯 CURRENT FOCUS\n\n`;
      
      if (topTask) {
        content += `## Top Priority Task\n`;
        content += `- **ID:** ${topTask.id}\n`;
        content += `- **Task:** ${topTask.task}\n`;
        content += `- **Project:** ${topTask.project}\n`;
        content += `- **Priority:** ${topTask.priority} (Score: ${topTask.priorityScore.toFixed(2)})\n`;
        content += `- **Status:** ${topTask.status}\n`;
        if (topTask.blocking) content += `- **Blocks:** ${topTask.blocking}\n`;
        if (topTask.notes) content += `- **Notes:** ${topTask.notes}\n`;
        content += `\n`;
      } else {
        content += `## No tasks in queue! 🎉\n\n`;
      }
      
      if (inProgress.length > 0) {
        content += `## Currently In Progress (${inProgress.length})\n`;
        for (const task of inProgress) {
          content += `- [${task.id}] ${task.task} (${task.project})\n`;
        }
        content += `\n`;
      }
      
      if (blocked.length > 0) {
        content += `## ⚠️ Blocked Tasks (${blocked.length})\n`;
        for (const task of blocked) {
          content += `- [${task.id}] ${task.task} - ${task.notes || 'No blockers noted'}\n`;
        }
        content += `\n`;
      }
      
      content += `---\n`;
      content += `**Action Required:** If working on something different from top priority, call \`log_context_switch\` first.\n`;
      
      return content;
    }
    
    case 'progress://task-protocol': {
      return `# 📋 TASK MANAGEMENT PROTOCOL (V4.0)

## MANDATORY: Follow this protocol for ALL work sessions

### 1. SESSION START
- Read \`progress://current-focus\` resource (this happens automatically)
- If user request ≠ top priority task, call \`log_context_switch\` with the current top task ID

### 2. ⚠️ CRITICAL: STARTING WORK ON A TASK
Before ANY actual work begins, you MUST call BOTH:

\`\`\`
1. log_task_selection(taskId: "TASK-ID")     // Logs which task was selected
2. update_task(id: "TASK-ID", status: "in_progress")  // Captures startedAt timestamp
\`\`\`

**Why this matters:**
- \`startedAt\` timestamp enables calculating \`actualWorkTime\` (not just queue time)
- ML can learn effort estimation: predicting how long tasks actually take
- Without this, we only know total time (creation → completion), not actual work duration

**WRONG:**
  User: "Let's fix the auth bug"
  Agent: *starts working on code immediately*

**RIGHT:**
  User: "Let's fix the auth bug"
  Agent: *calls log_task_selection(taskId: "AUTH-001")*
         *calls update_task(id: "AUTH-001", status: "in_progress")*
         *then starts working on code*

### 3. DURING WORK
- If hitting a blocker: \`update_task\` with status: "blocked" and describe blocker in notes
- If discovering new tasks: \`create_task\` with appropriate priority
- If making architectural decisions: \`log_decision\` with date, decision, and rationale

### 4. TASK COMPLETION
When ANY task is finished (even partially):
- Call \`complete_task\` with outcome:
  - "completed" - Task fully done
  - "deferred" - Paused, will resume later  
  - "cancelled" - No longer needed
  
This automatically calculates:
- \`actualCompletionTime\`: Hours from creation to completion (queue + work)
- \`actualWorkTime\`: Hours from startedAt to completion (actual effort)

### 5. SESSION END
- Ensure current task status reflects actual state
- If incomplete, update notes with progress summary

## DATA COLLECTION TARGETS (V4.0)
| Metric | Target | Why |
|--------|--------|-----|
| Completions with \`actualWorkTime\` | 10+ | Effort estimation learning |
| Task selections logged | 20+ | User preference signal |
| Priority changes | 5+ | Override/correction signal |

## ENFORCEMENT
Every tool response will remind you to follow this protocol. Non-compliance is logged.`;
    }
    
    case 'progress://auto-capture': {
      return `# 🎣 AUTOMATIC TASK CAPTURE GUIDELINES

## YOUR RESPONSIBILITY: Proactive Task Identification

**DO NOT** wait for users to explicitly say "add this task" or "create a task for X".
**DO** proactively identify work items from conversation and create/suggest tasks.

## TASK IDENTIFICATION TRIGGERS

### Immediate Task Creation (call \`create_task\` directly):
1. **Bug reports**: "X is broken", "there's an issue with Y", "Z doesn't work"
2. **Feature requests**: "we need X", "it would be nice to have Y", "let's add Z"
3. **Explicit work items**: "TODO", "FIXME", "we should", "need to", "have to"
4. **Blockers identified**: "can't do X until Y", "waiting on Z"
5. **Technical debt**: "this is hacky", "we should refactor", "temporary solution"

### Suggest Task Creation (ask user to confirm):
1. **Vague improvements**: "would be better if", "might want to consider"
2. **Future considerations**: "eventually", "someday", "nice to have"
3. **Uncertain scope**: Complex items needing breakdown

## TASK EXTRACTION EXAMPLES

| User Says | Action | Task Created |
|-----------|--------|--------------|
| "The login is slow" | CREATE | "Investigate login performance issues" (P1) |
| "We'll need to add OAuth eventually" | SUGGEST | "Implement OAuth authentication" (P3) |
| "This function is a mess, but it works" | CREATE | "Refactor [function name]" (P2) |
| "Can't deploy until tests pass" | CREATE | "Fix failing tests" (P0, blocking: deployment) |
| "Let's implement the dashboard" | CREATE | "Implement dashboard" + break into subtasks |

## PRIORITY ASSIGNMENT HEURISTICS

| Signal | Priority |
|--------|----------|
| "urgent", "critical", "broken", "blocking" | P0 |
| "important", "soon", "need", "should" | P1 |
| "would be nice", "eventually", "improve" | P2 |
| "maybe", "someday", "consider" | P3 |

## PROACTIVE BEHAVIORS

1. **End of conversation**: "I noticed we discussed [X, Y, Z]. Should I add these as tasks?"
2. **During work**: "This revealed we also need to [X]. Creating a P2 task for it."
3. **After completing work**: "Done! This also surfaced [X] as a follow-up. Added as P2."

## ANTI-PATTERNS (Don't Do These)

❌ Waiting for "please add a task"
❌ Letting work items mentioned in passing slip through
❌ Assuming user will remember to track things themselves
❌ Only tracking the main request, ignoring side discoveries

## ENFORCEMENT

At the END of every conversation:
1. List any potential tasks identified but not yet tracked
2. Ask user: "Should I add any of these to the queue?"
3. Default to creating tasks rather than losing track of work`;
    }
    
    case 'progress://project-registry': {
      const projects = await storage.getProjects();
      const tasks = await storage.getTasks();
      
      // Group tasks by project
      const tasksByProject = new Map<string, number>();
      for (const task of tasks) {
        const count = tasksByProject.get(task.project) || 0;
        tasksByProject.set(task.project, count + 1);
      }
      
      let content = `# 📁 PROJECT REGISTRY & ONBOARDING

## Known Projects

`;
      
      if (projects.length === 0) {
        content += `*No projects registered yet.*\n\n`;
      } else {
        content += `| Project | Path | Status | Tasks |\n`;
        content += `|---------|------|--------|-------|\n`;
        for (const project of projects) {
          const taskCount = tasksByProject.get(project.id) || tasksByProject.get(project.name) || 0;
          content += `| ${project.name} | \`${project.path}\` | ${project.status} | ${taskCount} |\n`;
        }
        content += `\n`;
      }
      
      content += `## 🚀 NEW PROJECT ONBOARDING

When you detect you're working in a **new or unregistered project directory**, follow this flow:

### Step 1: Check Current Directory
Look for these signals that indicate a new project:
- Working directory not in the project registry above
- User mentions a new project name
- Opening files in an untracked path

### Step 2: Register the Project
- Ask user: "I notice this is a new project. Should I register it with the task tracker?"
- If yes: Call \`create_project\` with name, path, and primary focus
- Create initial tasks based on what user wants to accomplish

## PROJECT REGISTRATION TEMPLATE

When registering a new project, gather:
- **name**: Short identifier (e.g., "marketplace-design")
- **path**: Full path (e.g., "~/Desktop/gravity/marketplace-design")
- **primaryFocus**: One-line description of project purpose
- **status**: One of: active, complete, blocked, shelved

## ARCHITECTURE

The MCP server maintains a centralized \`progress.json\` database as the **single source of truth** for all projects and tasks. No per-project files are created - all task management happens through the MCP API.
`;
      
      return content;
    }
    
    case 'progress://full-queue': {
      const tasks = await storage.getTasks();
      return JSON.stringify(tasks, null, 2);
    }
    
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

// ============================================================================
// MCP PROMPTS - Reusable workflow templates for ANY MCP client
// ============================================================================
const prompts = [
  {
    name: 'start_session',
    description: 'Initialize a work session with proper task tracking. Use this at the beginning of any conversation.',
    arguments: [
      {
        name: 'task_description',
        description: 'Brief description of what the user wants to work on',
        required: true,
      },
    ],
  },
  {
    name: 'complete_work',
    description: 'Properly close out work on a task with completion tracking.',
    arguments: [
      {
        name: 'task_id',
        description: 'ID of the task being completed',
        required: true,
      },
      {
        name: 'outcome',
        description: 'One of: completed, deferred, cancelled',
        required: true,
      },
      {
        name: 'summary',
        description: 'Brief summary of what was accomplished',
        required: false,
      },
    ],
  },
  {
    name: 'switch_context',
    description: 'Properly handle switching from one task to another.',
    arguments: [
      {
        name: 'from_task_id',
        description: 'Task ID being switched away from',
        required: true,
      },
      {
        name: 'to_task_description',
        description: 'Description of the new work',
        required: true,
      },
    ],
  },
  {
    name: 'onboard_project',
    description: 'Onboard a new project directory into the task tracking system.',
    arguments: [
      {
        name: 'project_path',
        description: 'Path to the project directory',
        required: true,
      },
      {
        name: 'project_name',
        description: 'Short name for the project',
        required: true,
      },
    ],
  },
  {
    name: 'end_session',
    description: 'Properly end a work session, capturing any untracked tasks and updating status.',
    arguments: [
      {
        name: 'conversation_summary',
        description: 'Brief summary of what was discussed/accomplished',
        required: true,
      },
    ],
  },
];

async function handlePromptGet(name: string, args: Record<string, string>): Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }> {
  switch (name) {
    case 'start_session': {
      const topTask = await storage.getTopPriority();
      const taskDesc = args.task_description || 'unspecified work';
      
      let prompt = `# Work Session Initialization\n\n`;
      prompt += `**User wants to work on:** ${taskDesc}\n\n`;
      
      if (topTask) {
        prompt += `**Current top priority:** [${topTask.id}] ${topTask.task} (${topTask.project})\n\n`;
        
        const isMatchingTop = taskDesc.toLowerCase().includes(topTask.task.toLowerCase().slice(0, 20));
        
        if (!isMatchingTop) {
          prompt += `⚠️ **CONTEXT SWITCH DETECTED**\n`;
          prompt += `User request doesn't match top priority. You MUST:\n`;
          prompt += `1. Call \`log_context_switch\` with taskId: "${topTask.id}"\n`;
          prompt += `2. Then proceed with the user's request\n\n`;
        }
      }
      
      prompt += `## Required Actions:\n`;
      prompt += `1. Acknowledge the task being worked on\n`;
      prompt += `2. Update task status to "in_progress" if applicable\n`;
      prompt += `3. Proceed with the work\n`;
      prompt += `4. Call \`complete_task\` when finished\n`;
      
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: prompt },
          },
        ],
      };
    }
    
    case 'complete_work': {
      const taskId = args.task_id;
      const outcome = args.outcome;
      const summary = args.summary || 'No summary provided';
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `# Task Completion\n\nComplete task ${taskId} with outcome "${outcome}".\n\nSummary: ${summary}\n\n**Required:** Call \`complete_task\` with id: "${taskId}" and outcome: "${outcome}"`,
            },
          },
        ],
      };
    }
    
    case 'switch_context': {
      const fromId = args.from_task_id;
      const toDesc = args.to_task_description;
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `# Context Switch\n\nSwitching from task ${fromId} to: ${toDesc}\n\n**Required Actions:**\n1. Call \`log_context_switch\` with taskId: "${fromId}"\n2. Update ${fromId} status to "waiting" or appropriate state\n3. Begin work on new task`,
            },
          },
        ],
      };
    }
    
    case 'onboard_project': {
      const projectPath = args.project_path;
      const projectName = args.project_name;
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `# Project Onboarding: ${projectName}

## Step 1: Register the Project
Call \`create_project\` with:
   - name: "${projectName}"
   - path: "${projectPath}"
   - primaryFocus: [ask user for one-line description]
   - status: "active"

## Step 2: Confirm registration
- Show user the registered project details
- List any imported tasks
- Ask what they want to work on first`,
            },
          },
        ],
      };
    }
    
    case 'end_session': {
      const summary = args.conversation_summary;
      const topTask = await storage.getTopPriority();
      const allTasks = await storage.getTasks();
      const inProgress = allTasks.filter(t => t.status === 'in_progress');
      
      let prompt = `# End of Session Checklist\n\n`;
      prompt += `## Conversation Summary\n${summary}\n\n`;
      
      prompt += `## Required Actions:\n\n`;
      prompt += `### 1. Task Status Updates\n`;
      if (inProgress.length > 0) {
        prompt += `The following tasks are marked "in_progress". Update each:\n`;
        for (const task of inProgress) {
          prompt += `- [${task.id}] ${task.task}\n`;
          prompt += `  → Call \`update_task\` or \`complete_task\` with appropriate status/outcome\n`;
        }
      } else {
        prompt += `No tasks currently in progress.\n`;
      }
      
      prompt += `\n### 2. Untracked Work Check\n`;
      prompt += `Review the conversation for any work items that weren't tracked:\n`;
      prompt += `- Call \`suggest_tasks\` with the conversation summary\n`;
      prompt += `- Create tasks for any legitimate work items identified\n`;
      
      prompt += `\n### 3. Next Session Prep\n`;
      if (topTask) {
        prompt += `Top priority for next session: [${topTask.id}] ${topTask.task}\n`;
      }
      
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: prompt },
          },
        ],
      };
    }
    
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// MCP Tool definitions - V2 with heap-based priority queue
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
    description: 'Get all tasks sorted by priority (P0 first). Excludes completed tasks by default.',
    inputSchema: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: 'Filter by specific priority level',
        },
        includeCompleted: {
          type: 'boolean',
          description: 'Include completed tasks (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_top_priority',
    description: 'V2: Get the single highest priority task based on weighted scoring',
    inputSchema: {
      type: 'object',
      properties: {},
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
        id: { type: 'string', description: 'Optional custom task ID (e.g., DATA-001)' },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        task: { type: 'string', description: 'Task description' },
        project: { type: 'string', description: 'Project ID or name' },
        blocking: { type: 'string', description: 'What this task blocks' },
        dependencies: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Task IDs this task depends on',
        },
        notes: { type: 'string', description: 'Additional notes' },
        deadline: { type: 'string', description: 'ISO date string for deadline' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Effort estimate' },
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
        blocking: { type: 'string' },
        dependencies: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        deadline: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
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
  {
    name: 'recalculate_priorities',
    description: 'V2: Recalculate all task priority scores based on current heuristic weights',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_heuristic_weights',
    description: 'V2: Get current heuristic weight configuration',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_heuristic_weights',
    description: 'V2: Update heuristic weights and recalculate all priorities',
    inputSchema: {
      type: 'object',
      properties: {
        blocking: { type: 'number', description: 'Weight for blocking count (default: 10.0)' },
        crossProject: { type: 'number', description: 'Weight for cross-project impact (default: 5.0)' },
        timeSensitive: { type: 'number', description: 'Weight for time sensitivity (default: 8.0)' },
        effortValue: { type: 'number', description: 'Weight for effort/value ratio (default: 3.0)' },
        dependency: { type: 'number', description: 'Weight for dependency depth (default: 2.0)' },
      },
      required: [],
    },
  },
  // ====== V2.2: Project & Task Tools ======
  {
    name: 'create_project',
    description: 'Register a new project with the task tracker. Use this when working in a new directory.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short project identifier (e.g., "marketplace-design")' },
        path: { type: 'string', description: 'Full path to project directory (e.g., "~/Desktop/gravity/marketplace-design")' },
        primaryFocus: { type: 'string', description: 'One-line description of project purpose' },
        status: { type: 'string', enum: ['active', 'complete', 'blocked', 'shelved'], description: 'Project status (default: active)' },
      },
      required: ['name', 'path', 'primaryFocus'],
    },
  },
  {
    name: 'suggest_tasks',
    description: 'Analyze text and suggest potential tasks to create. Use this proactively when user describes work.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze for potential tasks (conversation snippet, requirements, etc.)' },
        projectName: { type: 'string', description: 'Default project for suggested tasks' },
      },
      required: ['text'],
    },
  },
  // ====== V3: ML Training Data Tools ======
  {
    name: 'log_task_selection',
    description: 'V3: Log when user selects a task to work on (for ML training). Call this when user starts working on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task being selected' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'export_training_data',
    description: 'V3: Export all ML training data (completions, priority changes, selections) for XGBoost training.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ml_summary',
    description: 'V3: Get summary statistics of collected ML training data.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // ====== V3.2: Online Learning Tools ======
  {
    name: 'log_drag_reorder',
    description: 'V3.2: Log when user drag-and-drops to reorder tasks in the UI. Generates pairwise preferences for online learning.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task being dragged' },
        fromRank: { type: 'number', description: 'Original position (0-indexed)' },
        toRank: { type: 'number', description: 'New position after drop' },
      },
      required: ['taskId', 'fromRank', 'toRank'],
    },
  },
  {
    name: 'get_online_learner_state',
    description: 'V3.2: Get current state of the online learning system including weights, accuracy, and config.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_online_learner_config',
    description: 'V3.2: Update online learning configuration (learning rate, enabled, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enable/disable online weight updates' },
        learningRate: { type: 'number', description: 'SGD learning rate (default: 0.01)' },
        momentum: { type: 'number', description: 'Momentum coefficient (default: 0.9)' },
        maxWeightChange: { type: 'number', description: 'Max single-update delta (default: 0.5)' },
      },
      required: [],
    },
  },
  {
    name: 'get_drag_reorder_events',
    description: 'V3.2: Get all recorded drag reorder events (for analysis/debugging).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // ====== V4: Workspace Management Tools ======
  {
    name: 'list_workspaces',
    description: 'V4: List all available workspaces',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_current_workspace',
    description: 'V4: Get the currently active workspace',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_workspace',
    description: 'V4: Create a new workspace',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workspace name' },
        description: { type: 'string', description: 'Optional workspace description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'switch_workspace',
    description: 'V4: Switch to a different workspace. This changes the active workspace and reloads all tasks/projects.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace to switch to' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'delete_workspace',
    description: 'V4: Delete a workspace (cannot delete the current workspace)',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace to delete' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'seed_workspace',
    description: 'V4: Seed the current workspace with example data (only works if workspace is empty)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // ====== Team Pulse Sync Tools ======
  {
    name: 'enable_team_sync',
    description: 'Enable syncing task activity to the Team Pulse hub for team-wide awareness',
    inputSchema: {
      type: 'object',
      properties: {
        hubUrl: { type: 'string', description: 'URL of the Team Pulse hub (e.g., http://localhost:3100)' },
        userId: { type: 'string', description: 'Your user ID on the hub' },
        apiKey: { type: 'string', description: 'Your API key for the hub' },
      },
      required: ['hubUrl', 'userId', 'apiKey'],
    },
  },
  {
    name: 'disable_team_sync',
    description: 'Disable syncing to the Team Pulse hub',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_sync_status',
    description: 'Get the current Team Pulse sync status (enabled, queue depth, connection health)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_project_privacy',
    description: 'Mark a project as private so its tasks are not synced to the Team Pulse hub',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name to mark private/public' },
        private: { type: 'boolean', description: 'true to make private, false to make public' },
      },
      required: ['project', 'private'],
    },
  },
  {
    name: 'set_task_privacy',
    description: 'Mark a specific task as private so it is not synced to the Team Pulse hub',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to mark private/public' },
        private: { type: 'boolean', description: 'true to make private, false to make public' },
      },
      required: ['taskId', 'private'],
    },
  },
];

async function handleToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_status': {
      const db = await storage.getAll();
      const topPriority = await storage.getTopPriority();
      return {
        version: db.version,
        lastUpdated: db.lastUpdated,
        projects: db.projects,
        priorityQueue: await storage.getTasks(),
        dataGaps: db.dataGaps,
        decisions: db.decisions,
        topPriority,
        heuristicWeights: db.heuristicWeights,
      };
    }

    case 'get_priorities': {
      const includeCompleted = params.includeCompleted === true;
      if (params.priority) {
        const tasks = await storage.getTasksByPriority(params.priority as 'P0' | 'P1' | 'P2' | 'P3');
        return includeCompleted ? tasks : tasks.filter(t => t.status !== 'complete');
      }
      return storage.getTasks(includeCompleted);
    }

    case 'get_top_priority': {
      const topTask = await storage.getTopPriority();
      if (!topTask) {
        return { message: 'No tasks in queue' };
      }
      return {
        task: topTask,
        explanation: `Highest priority task based on weighted scoring. Priority score: ${topTask.priorityScore.toFixed(2)}`,
        weights: topTask.weights,
      };
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
      const created = await storage.createTask({
        id: params.id as string | undefined,
        priority: params.priority as 'P0' | 'P1' | 'P2' | 'P3',
        task: params.task as string,
        project: params.project as string,
        blocking: params.blocking as string | undefined,
        dependencies: params.dependencies as string[] | undefined,
        notes: params.notes as string | undefined,
        deadline: params.deadline as string | undefined,
        effort: params.effort as 'low' | 'medium' | 'high' | undefined,
      });
      syncEmitter.emitTaskCreated(created as unknown as Record<string, unknown>);
      return created;
    }

    case 'update_task': {
      const { id, ...updates } = params;
      const previousTask = await storage.getTask(id as string);
      const updated = await storage.updateTask(id as string, updates);
      if (previousTask) {
        syncEmitter.emitTaskUpdated(
          id as string,
          updates,
          previousTask as unknown as Record<string, unknown>,
        );
      }
      return updated;
    }

    case 'complete_task': {
      const taskBeforeComplete = await storage.getTask(params.id as string);
      const completionResult = await storage.completeTask(
        params.id as string,
        params.outcome as 'completed' | 'cancelled' | 'deferred'
      );
      if (taskBeforeComplete) {
        syncEmitter.emitTaskCompleted(
          taskBeforeComplete as unknown as Record<string, unknown>,
          params.outcome as string,
        );
      }
      return completionResult;
    }

    case 'log_context_switch': {
      const switchTask = await storage.getTask(params.taskId as string);
      await storage.logContextSwitch(params.taskId as string);
      if (switchTask) {
        syncEmitter.emitContextSwitch(
          switchTask.id,
          switchTask.task,
          switchTask.project,
        );
      }
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

    case 'recalculate_priorities': {
      const tasks = await storage.recalculateAllPriorities();
      return {
        message: 'All priorities recalculated',
        taskCount: tasks.length,
        topPriority: tasks[0] || null,
      };
    }

    case 'get_heuristic_weights': {
      return storage.getHeuristicWeights();
    }

    case 'update_heuristic_weights': {
      const newWeights = await storage.updateHeuristicWeights({
        blocking: params.blocking as number | undefined,
        crossProject: params.crossProject as number | undefined,
        timeSensitive: params.timeSensitive as number | undefined,
        effortValue: params.effortValue as number | undefined,
        dependency: params.dependency as number | undefined,
      });
      return {
        message: 'Heuristic weights updated and all priorities recalculated',
        weights: newWeights,
      };
    }

    // ====== V2.2: Project Tools ======
    case 'create_project': {
      const createdProject = await storage.createProject({
        name: params.name as string,
        path: params.path as string,
        primaryFocus: params.primaryFocus as string,
        status: (params.status as 'active' | 'complete' | 'blocked' | 'shelved') || 'active',
      });
      syncEmitter.emitProjectCreated(createdProject as unknown as Record<string, unknown>);
      return createdProject;
    }

    case 'suggest_tasks': {
      const text = params.text as string;
      const projectName = params.projectName as string || 'unknown';
      
      // Pattern matching for task extraction
      const patterns = [
        { regex: /(?:need to|have to|must|should)\s+([^.!?\n]+)/gi, priority: 'P1' as const },
        { regex: /(?:bug|broken|doesn't work|issue with)\s*:?\s*([^.!?\n]+)/gi, priority: 'P0' as const },
        { regex: /(?:TODO|FIXME|HACK)\s*:?\s*([^.!?\n]+)/gi, priority: 'P1' as const },
        { regex: /(?:would be nice|eventually|someday)\s+(?:to\s+)?([^.!?\n]+)/gi, priority: 'P3' as const },
        { regex: /(?:improve|refactor|optimize)\s+([^.!?\n]+)/gi, priority: 'P2' as const },
        { regex: /(?:add|implement|create|build)\s+([^.!?\n]+)/gi, priority: 'P1' as const },
        { regex: /(?:fix|resolve|address)\s+([^.!?\n]+)/gi, priority: 'P0' as const },
        { regex: /(?:blocked by|waiting on|can't.*until)\s+([^.!?\n]+)/gi, priority: 'P0' as const },
      ];
      
      const suggestions: Array<{
        task: string;
        priority: 'P0' | 'P1' | 'P2' | 'P3';
        source: string;
        confidence: 'high' | 'medium' | 'low';
      }> = [];
      
      const seenTasks = new Set<string>();
      
      for (const { regex, priority } of patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          const task = match[1].trim();
          const normalized = task.toLowerCase().slice(0, 50);
          
          if (task.length > 10 && task.length < 200 && !seenTasks.has(normalized)) {
            seenTasks.add(normalized);
            suggestions.push({
              task,
              priority,
              source: match[0].slice(0, 50),
              confidence: task.length > 20 ? 'high' : 'medium',
            });
          }
        }
      }
      
      return {
        suggestedTasks: suggestions,
        count: suggestions.length,
        projectName,
        instruction: suggestions.length > 0
          ? 'Review these suggestions and call create_task for any you want to track.'
          : 'No clear tasks identified. Consider asking user for clarification.',
        autoCreateThreshold: 'Tasks with high confidence about bugs/blockers should be auto-created.',
      };
    }

    // ====== V3: ML Training Data Tools ======
    case 'log_task_selection': {
      const selectionEvent = await storage.logTaskSelection(params.taskId as string);
      if (!selectionEvent) {
        return { error: 'Task not found' };
      }
      const selectedTask = await storage.getTask(params.taskId as string);
      if (selectedTask) {
        syncEmitter.emitTaskSelected(selectedTask as unknown as Record<string, unknown>);
      }
      return {
        event: selectionEvent,
        message: `Logged selection of task ${params.taskId}`,
        wasTopRecommendation: selectionEvent.wasTopSelected,
      };
    }

    case 'export_training_data': {
      return storage.exportTrainingData();
    }

    case 'get_ml_summary': {
      const data = await storage.exportTrainingData();
      return {
        summary: data.summary,
        currentWeights: data.heuristicWeights,
        recommendation: data.summary.selectionAccuracy < 70
          ? 'Selection accuracy below 70% - consider retraining weights with XGBoost'
          : 'Selection accuracy is good - current weights are performing well',
        dataReadiness: {
          hasEnoughCompletions: data.summary.totalCompletions >= 10,
          hasEnoughSelections: data.summary.totalSelections >= 20,
          hasPriorityFeedback: data.summary.totalPriorityChanges > 0,
          readyForTraining: data.summary.totalCompletions >= 10 && data.summary.totalSelections >= 20,
        },
      };
    }

    // ====== V3.2: Online Learning Tools ======
    case 'log_drag_reorder': {
      const event = await storage.logDragReorder({
        taskId: params.taskId as string,
        fromRank: params.fromRank as number,
        toRank: params.toRank as number,
      });
      return {
        event,
        message: `Logged drag reorder: ${event.taskId} moved from rank ${event.fromRank} to ${event.toRank}`,
        pairsGenerated: event.implicitPreferences.length,
        weightUpdateApplied: !!event.appliedWeightDelta,
        appliedDelta: event.appliedWeightDelta,
      };
    }

    case 'get_online_learner_state': {
      const metrics = await storage.getOnlineLearnerMetrics();
      return {
        ...metrics,
        status: metrics.enabled ? 'active' : 'disabled',
        description: 'Online learning adapts heuristic weights based on your drag-and-drop reordering in the UI.',
      };
    }

    case 'update_online_learner_config': {
      const newConfig = await storage.updateOnlineLearnerConfig({
        enabled: params.enabled as boolean | undefined,
        learningRate: params.learningRate as number | undefined,
        momentum: params.momentum as number | undefined,
        maxWeightChange: params.maxWeightChange as number | undefined,
      });
      return {
        message: 'Online learner configuration updated',
        config: newConfig,
      };
    }

    case 'get_drag_reorder_events': {
      const events = await storage.getDragReorderEvents();
      return {
        events,
        count: events.length,
        summary: {
          totalPromotions: events.filter(e => e.direction === 'promoted').length,
          totalDemotions: events.filter(e => e.direction === 'demoted').length,
          totalPairsGenerated: events.reduce((sum, e) => sum + e.implicitPreferences.length, 0),
          eventsWithWeightUpdates: events.filter(e => e.appliedWeightDelta).length,
        },
      };
    }

    // ====== V4: Workspace Management Tools ======
    case 'list_workspaces': {
      const workspaces = await storage.getWorkspaces();
      const currentId = await storage.getCurrentWorkspaceId();
      return {
        workspaces,
        currentWorkspaceId: currentId,
        count: workspaces.length,
      };
    }

    case 'get_current_workspace': {
      const currentId = await storage.getCurrentWorkspaceId();
      if (!currentId) {
        return { message: 'No workspace is currently active' };
      }
      const workspace = await storage.getWorkspace(currentId);
      return {
        workspace: workspace || null,
        workspaceId: currentId,
      };
    }

    case 'create_workspace': {
      const workspace = await storage.createWorkspace({
        name: params.name as string,
        description: params.description as string | undefined,
      });
      const currentId = await storage.getCurrentWorkspaceId();
      return {
        workspace,
        message: `Created workspace "${workspace.name}"`,
        isCurrent: workspace.id === currentId,
      };
    }

    case 'switch_workspace': {
      await storage.switchWorkspace(params.workspaceId as string);
      const workspace = await storage.getWorkspace(params.workspaceId as string);
      return {
        workspace,
        message: `Switched to workspace "${workspace?.name || params.workspaceId}"`,
        workspaceId: params.workspaceId,
      };
    }

    case 'delete_workspace': {
      const deleted = await storage.deleteWorkspace(params.workspaceId as string);
      return {
        success: deleted,
        message: deleted 
          ? `Deleted workspace ${params.workspaceId}`
          : `Workspace ${params.workspaceId} not found`,
      };
    }

    case 'seed_workspace': {
      await storage.seedCurrentWorkspace();
      return {
        success: true,
        message: 'Workspace seeded with example data (1 project, 1 task)',
      };
    }

    // ====== Team Pulse Sync Tools ======
    case 'enable_team_sync': {
      const newConfig = updateTeamPulseConfig({
        enabled: true,
        hubUrl: params.hubUrl as string,
        userId: params.userId as string,
        apiKey: params.apiKey as string,
      });
      syncEmitter.updateConfig(newConfig);
      syncClient.updateConfig(newConfig);
      syncClient.start();
      return {
        success: true,
        message: `Team Pulse sync enabled → ${newConfig.hubUrl}`,
        userId: newConfig.userId,
      };
    }

    case 'disable_team_sync': {
      const disabledConfig = updateTeamPulseConfig({ enabled: false });
      syncEmitter.updateConfig(disabledConfig);
      syncClient.stop();
      return { success: true, message: 'Team Pulse sync disabled' };
    }

    case 'get_sync_status': {
      const currentConfig = loadTeamPulseConfig();
      const clientStatus = syncClient.getStatus();
      return {
        ...clientStatus,
        userId: currentConfig.userId,
        privacyRules: currentConfig.privacyRules,
      };
    }

    case 'set_project_privacy': {
      const currentCfg = loadTeamPulseConfig();
      const projectName = params.project as string;
      const isPrivate = params.private as boolean;
      const projects = new Set(currentCfg.privacyRules.privateProjects);
      if (isPrivate) {
        projects.add(projectName);
      } else {
        projects.delete(projectName);
      }
      const updatedCfg = updateTeamPulseConfig({
        privacyRules: {
          ...currentCfg.privacyRules,
          privateProjects: Array.from(projects),
        },
      });
      syncEmitter.updateConfig(updatedCfg);
      return {
        success: true,
        message: `Project "${projectName}" is now ${isPrivate ? 'private' : 'public'}`,
        privateProjects: updatedCfg.privacyRules.privateProjects,
      };
    }

    case 'set_task_privacy': {
      const curCfg = loadTeamPulseConfig();
      const taskId = params.taskId as string;
      const taskPrivate = params.private as boolean;
      const tasks = new Set(curCfg.privacyRules.privateTasks);
      if (taskPrivate) {
        tasks.add(taskId);
      } else {
        tasks.delete(taskId);
      }
      const updCfg = updateTeamPulseConfig({
        privacyRules: {
          ...curCfg.privacyRules,
          privateTasks: Array.from(tasks),
        },
      });
      syncEmitter.updateConfig(updCfg);
      return {
        success: true,
        message: `Task "${taskId}" is now ${taskPrivate ? 'private' : 'public'}`,
        privateTasks: updCfg.privacyRules.privateTasks,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Export getters for the processor
export function getTools() {
  return tools;
}

export function getResources() {
  return resources;
}

export function getPrompts() {
  return prompts;
}

export { handleToolCall, handleResourceRead, handlePromptGet };

// Keep old handler for backwards compatibility
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
            resources: {
              subscribe: false,  // We don't support subscriptions yet
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
          // Include instructions that clients should show to AI
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

      // ====== TOOLS ======
      case 'tools/list':
        response.result = { tools };
        break;

      case 'tools/call': {
        const { name, arguments: args } = rpcReq.params as {
          name: string;
          arguments: Record<string, unknown>;
        };
        const result = await handleToolCall(name, args || {});
        
        // Include protocol reminder in every tool response
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

      // ====== RESOURCES (Universal Context Injection) ======
      case 'resources/list':
        response.result = { resources };
        break;

      case 'resources/read': {
        const { uri } = rpcReq.params as { uri: string };
        const content = await handleResourceRead(uri);
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

      // ====== PROMPTS (Universal Workflow Templates) ======
      case 'prompts/list':
        response.result = { prompts };
        break;

      case 'prompts/get': {
        const { name, arguments: promptArgs } = rpcReq.params as {
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
