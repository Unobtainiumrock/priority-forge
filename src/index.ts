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

// MCP endpoint (JSON-RPC 2.0)
app.post('/mcp', mcpHandler);

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       MCP Progress Tracker Server v2.1                        ║
║       Universal Task Tracking Protocol                        ║
╠═══════════════════════════════════════════════════════════════╣
║  REST API:  http://localhost:${PORT}                             ║
║  MCP:       http://localhost:${PORT}/mcp                         ║
║  Health:    http://localhost:${PORT}/health                      ║
╠═══════════════════════════════════════════════════════════════╣
║  V2.1 NEW - MCP Resources & Prompts (Universal Coverage):     ║
║    resources/list            - List available resources       ║
║    resources/read            - Read resource content          ║
║    prompts/list              - List workflow templates        ║
║    prompts/get               - Get prompt with arguments      ║
║  REST Access:                                                 ║
║    GET  /resources/current-focus  - Top priority + status     ║
║    GET  /resources/protocol       - Task management protocol  ║
╠═══════════════════════════════════════════════════════════════╣
║  V2 Endpoints:                                                ║
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
