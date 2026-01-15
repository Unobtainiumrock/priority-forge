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

import express from 'express';
import { storage } from './storage/jsonStorage';
import { mcpHandler } from './mcp/handler';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import dataGapsRouter from './routes/dataGaps';
import decisionsRouter from './routes/decisions';

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json());

// CORS middleware for frontend
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: 'v2', timestamp: new Date().toISOString() });
});

// Full status endpoint - V2 with heap-based priorities
app.get('/status', async (_req, res) => {
  try {
    const db = await storage.getAll();
    const tasks = await storage.getTasks();
    const topPriority = await storage.getTopPriority();
    res.json({
      version: db.version,
      lastUpdated: db.lastUpdated,
      projects: db.projects,
      priorityQueue: tasks,
      dataGaps: db.dataGaps,
      decisions: db.decisions,
      topPriority,
      heuristicWeights: db.heuristicWeights,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// V2: Top priority endpoint
app.get('/top-priority', async (_req, res) => {
  try {
    const topTask = await storage.getTopPriority();
    if (!topTask) {
      return res.json({ message: 'No tasks in queue' });
    }
    res.json({
      task: topTask,
      explanation: `Highest priority based on weighted scoring. Score: ${topTask.priorityScore.toFixed(2)}`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch top priority' });
  }
});

// V2: Recalculate priorities endpoint
app.post('/recalculate', async (_req, res) => {
  try {
    const tasks = await storage.recalculateAllPriorities();
    res.json({
      message: 'All priorities recalculated',
      taskCount: tasks.length,
      topPriority: tasks[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to recalculate priorities' });
  }
});

// V2: Heuristic weights management
app.get('/heuristic-weights', async (_req, res) => {
  try {
    const weights = await storage.getHeuristicWeights();
    res.json(weights);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch heuristic weights' });
  }
});

app.put('/heuristic-weights', async (req, res) => {
  try {
    const weights = await storage.updateHeuristicWeights(req.body);
    res.json({
      message: 'Heuristic weights updated and all priorities recalculated',
      weights,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update heuristic weights' });
  }
});

// REST API routes
app.use('/projects', projectsRouter);
app.use('/tasks', tasksRouter);
app.use('/data-gaps', dataGapsRouter);
app.use('/decisions', decisionsRouter);

// Completion records (V3 prep)
app.get('/completion-records', async (_req, res) => {
  try {
    const records = await storage.getCompletionRecords();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch completion records' });
  }
});

// V3.2: Online Learning - Drag Reorder
app.post('/drag-reorder', async (req, res) => {
  try {
    const { taskId, fromRank, toRank } = req.body;
    const event = await storage.logDragReorder({ taskId, fromRank, toRank });
    res.json({
      event,
      message: `Logged drag reorder: ${event.taskId} moved from rank ${event.fromRank} to ${event.toRank}`,
      pairsGenerated: event.implicitPreferences.length,
      weightUpdateApplied: !!event.appliedWeightDelta,
      appliedDelta: event.appliedWeightDelta,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to log drag reorder' });
  }
});

// V3.2: Get Online Learner State
app.get('/online-learner', async (_req, res) => {
  try {
    const metrics = await storage.getOnlineLearnerMetrics();
    res.json({
      ...metrics,
      status: metrics.enabled ? 'active' : 'disabled',
      description: 'Online learning adapts heuristic weights based on your drag-and-drop reordering in the UI.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch online learner state' });
  }
});

// V3.2: Update Online Learner Config
app.put('/online-learner', async (req, res) => {
  try {
    const config = await storage.updateOnlineLearnerConfig(req.body);
    res.json({
      message: 'Online learner configuration updated',
      config,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update online learner config' });
  }
});

// V3.2: Get Drag Reorder Events
app.get('/drag-reorder-events', async (_req, res) => {
  try {
    const events = await storage.getDragReorderEvents();
    res.json({
      events,
      count: events.length,
      summary: {
        totalPromotions: events.filter(e => e.direction === 'promoted').length,
        totalDemotions: events.filter(e => e.direction === 'demoted').length,
        totalPairsGenerated: events.reduce((sum, e) => sum + e.implicitPreferences.length, 0),
        eventsWithWeightUpdates: events.filter(e => e.appliedWeightDelta).length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drag reorder events' });
  }
});

// V2.1: Resource endpoints (REST access to MCP resources)
app.get('/resources/current-focus', async (_req, res) => {
  try {
    const topTask = await storage.getTopPriority();
    const allTasks = await storage.getTasks();
    const inProgress = allTasks.filter(t => t.status === 'in_progress');
    const blocked = allTasks.filter(t => t.status === 'blocked');
    
    res.json({
      topPriority: topTask,
      inProgress,
      blocked,
      message: topTask 
        ? `Top priority: [${topTask.id}] ${topTask.task}`
        : 'No tasks in queue',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch current focus' });
  }
});

app.get('/resources/protocol', (_req, res) => {
  res.type('text/plain').send(`# TASK MANAGEMENT PROTOCOL

## MANDATORY: Follow this protocol for ALL work sessions

### 1. SESSION START
- Read current-focus resource (GET /resources/current-focus)
- If user request ≠ top priority task, call log_context_switch
- Call update_task with status: "in_progress" for the task being worked on

### 2. DURING WORK
- If hitting a blocker: update_task with status: "blocked" and describe blocker in notes
- If discovering new tasks: create_task with appropriate priority
- If making architectural decisions: log_decision with date, decision, and rationale

### 3. TASK COMPLETION
When ANY task is finished (even partially):
- Call complete_task with outcome:
  - "completed" - Task fully done
  - "deferred" - Paused, will resume later  
  - "cancelled" - No longer needed

### 4. SESSION END
- Ensure current task status reflects actual state
- If incomplete, update notes with progress summary
`);
});

// V4: Workspace Management
app.get('/workspaces', async (_req, res) => {
  try {
    const workspaces = await storage.getWorkspaces();
    const currentId = await storage.getCurrentWorkspaceId();
    res.json({
      workspaces,
      currentWorkspaceId: currentId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

app.get('/workspaces/current', async (_req, res) => {
  try {
    const currentId = await storage.getCurrentWorkspaceId();
    if (!currentId) {
      return res.json({ workspace: null, workspaceId: null });
    }
    const workspace = await storage.getWorkspace(currentId);
    res.json({
      workspace: workspace || null,
      workspaceId: currentId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch current workspace' });
  }
});

app.post('/workspaces', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }
    const workspace = await storage.createWorkspace({ name, description });
    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create workspace' });
  }
});

app.post('/workspaces/:id/switch', async (req, res) => {
  try {
    const { id } = req.params;
    await storage.switchWorkspace(id);
    const workspace = await storage.getWorkspace(id);
    res.json({
      workspace,
      message: `Switched to workspace "${workspace?.name || id}"`,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to switch workspace' });
  }
});

app.delete('/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await storage.deleteWorkspace(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    res.json({ success: true, message: `Deleted workspace ${id}` });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete workspace' });
  }
});

app.post('/workspaces/current/seed', async (_req, res) => {
  try {
    await storage.seedCurrentWorkspace();
    res.json({ success: true, message: 'Workspace seeded with example data' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to seed workspace' });
  }
});

// MCP endpoint (JSON-RPC 2.0)
app.post('/mcp', mcpHandler);

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       Priority Forge v3.2                                     ║
║       Online Learning from Drag-and-Drop Reordering           ║
╠═══════════════════════════════════════════════════════════════╣
║  REST API:  http://localhost:${PORT}                             ║
║  MCP:       http://localhost:${PORT}/mcp                         ║
║  Health:    http://localhost:${PORT}/health                      ║
╠═══════════════════════════════════════════════════════════════╣
║  V3.2 NEW - Online Learning from UI:                          ║
║    • Drag-and-drop tasks to reorder → generates pairwise      ║
║      preferences → SGD updates weights → all scores recalc    ║
║    • POST /drag-reorder      - Log drag event + learn         ║
║    • GET  /online-learner    - View learning state/accuracy   ║
║    • PUT  /online-learner    - Configure learning rate, etc.  ║
║    • GET  /drag-reorder-events - View all drag history        ║
╠═══════════════════════════════════════════════════════════════╣
║  V3 - Dynamic Rebalancing + ML Training:                      ║
║    • Queue auto-rebalances on dependency graph changes        ║
║    • Logs QueueRebalanceEvents for trajectory learning        ║
║    • Collects PriorityChangeEvents & TaskSelectionEvents      ║
║    • export_training_data    - Export for XGBoost training    ║
║    • get_ml_summary          - Training data statistics       ║
╠═══════════════════════════════════════════════════════════════╣
║  MCP Resources & Prompts:                                     ║
║    resources/list            - List available resources       ║
║    resources/read            - Read resource content          ║
║    prompts/list              - List workflow templates        ║
║    prompts/get               - Get prompt with arguments      ║
╠═══════════════════════════════════════════════════════════════╣
║  Priority Endpoints:                                          ║
║    GET  /status              - Full system status             ║
║    GET  /top-priority        - Single highest priority task   ║
║    POST /recalculate         - Recalculate all priorities     ║
║    GET  /heuristic-weights   - View weight configuration      ║
║    PUT  /heuristic-weights   - Update weights & recalculate   ║
╠═══════════════════════════════════════════════════════════════╣
║  Standard Endpoints:                                          ║
║    CRUD /projects            - Project management             ║
║    CRUD /tasks               - Task priority queue            ║
║    CRUD /data-gaps           - Data collection gaps           ║
║    POST /decisions           - Decision log                   ║
║    POST /mcp                 - MCP JSON-RPC 2.0               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
