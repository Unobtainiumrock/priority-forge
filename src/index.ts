import express from 'express';
import { storage } from './storage/jsonStorage';
import { writeMarkdown } from './markdown/generator';
import { mcpHandler } from './mcp/handler';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import dataGapsRouter from './routes/dataGaps';
import decisionsRouter from './routes/decisions';

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json());

// Register markdown regeneration callback
storage.setOnWriteCallback(async () => {
  const db = await storage.getAll();
  await writeMarkdown(db);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Full status endpoint
app.get('/status', async (_req, res) => {
  try {
    const db = await storage.getAll();
    const tasks = await storage.getTasks();
    res.json({
      version: db.version,
      lastUpdated: db.lastUpdated,
      projects: db.projects,
      priorityQueue: tasks,
      dataGaps: db.dataGaps,
      decisions: db.decisions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch status' });
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

// MCP endpoint (JSON-RPC 2.0)
app.post('/mcp', mcpHandler);

// Generate initial markdown on startup
(async () => {
  const db = await storage.getAll();
  await writeMarkdown(db);
})();

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         MCP Progress Tracker Server                           ║
╠═══════════════════════════════════════════════════════════════╣
║  REST API:  http://localhost:${PORT}                             ║
║  MCP:       http://localhost:${PORT}/mcp                         ║
║  Health:    http://localhost:${PORT}/health                      ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /status          - Full system status                 ║
║    CRUD /projects        - Project management                 ║
║    CRUD /tasks           - Task priority queue                ║
║    CRUD /data-gaps       - Data collection gaps               ║
║    POST /decisions       - Decision log                       ║
║    POST /mcp             - MCP JSON-RPC 2.0                   ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
