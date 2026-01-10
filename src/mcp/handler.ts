import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
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
      return `# 📋 TASK MANAGEMENT PROTOCOL

## MANDATORY: Follow this protocol for ALL work sessions

### 1. SESSION START
- Read \`progress://current-focus\` resource (this happens automatically)
- If user request ≠ top priority task, call \`log_context_switch\` with the current top task ID
- Call \`update_task\` with status: "in_progress" for the task being worked on

### 2. DURING WORK
- If hitting a blocker: \`update_task\` with status: "blocked" and describe blocker in notes
- If discovering new tasks: \`create_task\` with appropriate priority
- If making architectural decisions: \`log_decision\` with date, decision, and rationale

### 3. TASK COMPLETION
When ANY task is finished (even partially):
- Call \`complete_task\` with outcome:
  - "completed" - Task fully done
  - "deferred" - Paused, will resume later  
  - "cancelled" - No longer needed

### 4. SESSION END
- Ensure current task status reflects actual state
- If incomplete, update notes with progress summary

## WHY THIS MATTERS
- Completion records train the V3 neural network for better priority scoring
- Context switch logs help identify task fragmentation
- Accurate status enables cross-project coordination

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

### Step 2: Check for Existing Tracker
Call \`check_project_tracker\` with the project path to see if a \`PROGRESS_TRACKER.md\` exists.

### Step 3: Based on Result

**If tracker exists:**
- Call \`import_project_tracker\` to sync tasks into MCP
- Register the project with \`create_project\`

**If no tracker:**
- Ask user: "I notice this is a new project. Should I register it with the task tracker?"
- If yes: Call \`create_project\` with name, path, and primary focus
- Create initial tasks based on what user wants to accomplish

### Step 4: Ongoing Sync
- Use \`sync_to_project\` to write MCP tasks back to project's local tracker
- This keeps per-project markdown files in sync with central MCP

## PROJECT REGISTRATION TEMPLATE

When registering a new project, gather:
- **name**: Short identifier (e.g., "marketplace-design")
- **path**: Full path (e.g., "~/Desktop/gravity/marketplace-design")
- **primaryFocus**: One-line description of project purpose
- **status**: One of: active, complete, blocked, shelved

## CROSS-PROJECT SYNC ARCHITECTURE

\`\`\`
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Project A      │     │  Project B      │     │  Project C      │
│  PROGRESS_      │     │  PROGRESS_      │     │  PROGRESS_      │
│  TRACKER.md     │     │  TRACKER.md     │     │  TRACKER.md     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │    import/sync        │    import/sync        │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   MCP Progress Server   │
                    │   (Central Source of    │
                    │    Truth)               │
                    │                         │
                    │   progress.json         │
                    │   ┌─────────────────┐   │
                    │   │  All Projects   │   │
                    │   │  All Tasks      │   │
                    │   │  Priority Queue │   │
                    │   └─────────────────┘   │
                    └────────────────────────┘
\`\`\`

The MCP server is the **source of truth**. Per-project trackers are convenience views.
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

## Step 1: Check for existing tracker
Call \`check_project_tracker\` with projectPath: "${projectPath}"

## Step 2: Based on result

**If tracker exists:**
1. Call \`import_project_tracker\` with projectPath: "${projectPath}" and projectName: "${projectName}"
2. Call \`create_project\` to register the project

**If no tracker:**
1. Call \`create_project\` with:
   - name: "${projectName}"
   - path: "${projectPath}"
   - primaryFocus: [ask user for one-line description]
   - status: "active"

## Step 3: Confirm registration
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
  // ====== V2.2: Project Sync & Onboarding Tools ======
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
    name: 'check_project_tracker',
    description: 'Check if a PROGRESS_TRACKER.md exists in a project directory. Use for onboarding new projects.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to check for PROGRESS_TRACKER.md' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'import_project_tracker',
    description: 'Import tasks from an existing PROGRESS_TRACKER.md file into the MCP. Parses markdown and creates tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Path to project containing PROGRESS_TRACKER.md' },
        projectName: { type: 'string', description: 'Project name for imported tasks' },
      },
      required: ['projectPath', 'projectName'],
    },
  },
  {
    name: 'sync_to_project',
    description: 'Sync MCP tasks to a project\'s local PROGRESS_TRACKER.md file. Writes current task state.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name to filter tasks' },
        projectPath: { type: 'string', description: 'Path where PROGRESS_TRACKER.md should be written' },
      },
      required: ['projectName', 'projectPath'],
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
      if (params.priority) {
        return storage.getTasksByPriority(params.priority as 'P0' | 'P1' | 'P2' | 'P3');
      }
      return storage.getTasks();
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
      return storage.createTask({
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

    // ====== V2.2: Project Sync & Onboarding ======
    case 'create_project': {
      return storage.createProject({
        name: params.name as string,
        path: params.path as string,
        primaryFocus: params.primaryFocus as string,
        status: (params.status as 'active' | 'complete' | 'blocked' | 'shelved') || 'active',
      });
    }

    case 'check_project_tracker': {
      const projectPath = (params.projectPath as string).replace(/^~/, process.env.HOME || '');
      const trackerPath = path.join(projectPath, 'PROGRESS_TRACKER.md');
      const unifiedPath = path.join(projectPath, 'UNIFIED_PROGRESS_TRACKER.md');
      
      const trackerExists = fs.existsSync(trackerPath);
      const unifiedExists = fs.existsSync(unifiedPath);
      
      // Check if project is already registered
      const projects = await storage.getProjects();
      const isRegistered = projects.some(p => 
        p.path === projectPath || 
        p.path === params.projectPath ||
        p.path.replace(/^~/, process.env.HOME || '') === projectPath
      );
      
      return {
        projectPath,
        trackerExists,
        trackerPath: trackerExists ? trackerPath : null,
        unifiedTrackerExists: unifiedExists,
        unifiedTrackerPath: unifiedExists ? unifiedPath : null,
        isRegisteredProject: isRegistered,
        recommendation: !isRegistered 
          ? 'Project not registered. Call create_project to register it.'
          : trackerExists || unifiedExists
            ? 'Project has existing tracker. Consider calling import_project_tracker.'
            : 'Project registered but no local tracker. Tasks are tracked in central MCP.',
      };
    }

    case 'import_project_tracker': {
      const projectPath = (params.projectPath as string).replace(/^~/, process.env.HOME || '');
      const projectName = params.projectName as string;
      
      // Try both tracker file names
      let trackerPath = path.join(projectPath, 'PROGRESS_TRACKER.md');
      if (!fs.existsSync(trackerPath)) {
        trackerPath = path.join(projectPath, 'UNIFIED_PROGRESS_TRACKER.md');
      }
      
      if (!fs.existsSync(trackerPath)) {
        return {
          success: false,
          error: 'No PROGRESS_TRACKER.md or UNIFIED_PROGRESS_TRACKER.md found',
          projectPath,
        };
      }
      
      const content = fs.readFileSync(trackerPath, 'utf-8');
      
      // Parse markdown for tasks (simple regex-based parsing)
      const tasksCreated: Array<{ id: string; task: string; priority: string }> = [];
      
      // Match table rows like: | **ID** | Task | Project | Status |
      // or | ID | Task | Project | Status |
      const taskTableRegex = /\|\s*\*?\*?([A-Z]+-\d+)\*?\*?\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/g;
      let match;
      
      while ((match = taskTableRegex.exec(content)) !== null) {
        const [, id, task, , status] = match;
        const cleanTask = task.trim();
        const cleanStatus = status.trim().toLowerCase();
        
        // Skip header rows
        if (id === 'ID' || cleanTask === 'Task' || cleanTask.includes('---')) continue;
        
        // Determine priority from ID prefix or context
        let priority: 'P0' | 'P1' | 'P2' | 'P3' = 'P2';
        if (content.includes(`### P0`) && content.indexOf(id) > content.indexOf('### P0')) priority = 'P0';
        else if (content.includes(`### P1`) && content.indexOf(id) > content.indexOf('### P1')) priority = 'P1';
        else if (content.includes(`### P3`) && content.indexOf(id) > content.indexOf('### P3')) priority = 'P3';
        
        // Map status
        let taskStatus: 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'waiting' = 'not_started';
        if (cleanStatus.includes('✅') || cleanStatus.includes('complete')) taskStatus = 'complete';
        else if (cleanStatus.includes('🔄') || cleanStatus.includes('progress')) taskStatus = 'in_progress';
        else if (cleanStatus.includes('⏳') || cleanStatus.includes('waiting')) taskStatus = 'waiting';
        else if (cleanStatus.includes('⏸️') || cleanStatus.includes('blocked')) taskStatus = 'blocked';
        
        // Check if task already exists
        const existingTask = await storage.getTask(id);
        if (!existingTask) {
          await storage.createTask({
            id,
            priority,
            task: cleanTask,
            project: projectName,
            status: taskStatus,
          });
          tasksCreated.push({ id, task: cleanTask, priority });
        }
      }
      
      return {
        success: true,
        trackerPath,
        tasksImported: tasksCreated.length,
        tasks: tasksCreated,
        message: tasksCreated.length > 0 
          ? `Imported ${tasksCreated.length} tasks from ${trackerPath}`
          : 'No new tasks to import (may already exist in MCP)',
      };
    }

    case 'sync_to_project': {
      const projectName = params.projectName as string;
      const projectPath = (params.projectPath as string).replace(/^~/, process.env.HOME || '');
      const trackerPath = path.join(projectPath, 'PROGRESS_TRACKER.md');
      
      // Get tasks for this project
      const allTasks = await storage.getTasks();
      const projectTasks = allTasks.filter(t => 
        t.project === projectName || 
        t.project.toLowerCase() === projectName.toLowerCase()
      );
      
      // Generate markdown
      let md = `# Progress Tracker: ${projectName}\n\n`;
      md += `> Auto-generated from MCP Progress Server\n`;
      md += `> Last synced: ${new Date().toISOString()}\n\n`;
      md += `---\n\n`;
      
      // Group by priority
      const byPriority = {
        P0: projectTasks.filter(t => t.priority === 'P0'),
        P1: projectTasks.filter(t => t.priority === 'P1'),
        P2: projectTasks.filter(t => t.priority === 'P2'),
        P3: projectTasks.filter(t => t.priority === 'P3'),
      };
      
      const statusEmoji: Record<string, string> = {
        not_started: '❌',
        in_progress: '🔄',
        complete: '✅',
        blocked: '⏸️',
        waiting: '⏳',
      };
      
      for (const [priority, tasks] of Object.entries(byPriority)) {
        if (tasks.length === 0) continue;
        
        md += `## ${priority}: ${priority === 'P0' ? 'Critical' : priority === 'P1' ? 'High' : priority === 'P2' ? 'Medium' : 'Low'} Priority\n\n`;
        md += `| ID | Task | Status | Notes |\n`;
        md += `|----|------|--------|-------|\n`;
        
        for (const task of tasks) {
          const emoji = statusEmoji[task.status] || '❓';
          md += `| ${task.id} | ${task.task} | ${emoji} ${task.status} | ${task.notes || ''} |\n`;
        }
        md += `\n`;
      }
      
      // Write file
      fs.writeFileSync(trackerPath, md);
      
      return {
        success: true,
        trackerPath,
        tasksSynced: projectTasks.length,
        message: `Synced ${projectTasks.length} tasks to ${trackerPath}`,
      };
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
            resources: {
              subscribe: false,  // We don't support subscriptions yet
              listChanged: false,
            },
            prompts: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'progress-tracker',
            version: '2.2.0',  // Auto-capture, project sync, onboarding
          },
          // Include instructions that clients should show to AI
          instructions: `You are connected to a task prioritization system (Priority Forge v2.2).

## MANDATORY STARTUP SEQUENCE
1. Read 'progress://current-focus' - understand top priority
2. Read 'progress://auto-capture' - learn to proactively identify tasks
3. Read 'progress://project-registry' - check if current project is registered

## DURING CONVERSATION
- Proactively identify tasks from user's descriptions (don't wait for "add a task")
- Call 'suggest_tasks' when user describes work items
- Update task status as work progresses
- Log context switches when changing topics

## ON NEW PROJECT
- Call 'check_project_tracker' to see if PROGRESS_TRACKER.md exists
- If unregistered: call 'create_project' to register it
- If tracker exists: call 'import_project_tracker' to sync

## END OF CONVERSATION
- Update all in-progress tasks
- Call 'complete_task' for finished work
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
