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

import { Router, Request, Response } from 'express';
import { storage } from '../storage/jsonStorage';
import { CreateTaskDTO, UpdateTaskDTO, Priority } from '../types/schema';

const router = Router();

// GET /tasks - List active tasks (sorted by priority score in V2)
// Use ?all=true to include completed tasks
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeCompleted = req.query.all === 'true';
    const tasks = await storage.getTasks(includeCompleted);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /tasks/completed - List completed tasks only
router.get('/completed', async (_req: Request, res: Response) => {
  try {
    const tasks = await storage.getCompletedTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch completed tasks' });
  }
});

// GET /tasks/priority/:level - Filter by priority
router.get('/priority/:level', async (req: Request, res: Response) => {
  try {
    const level = req.params.level.toUpperCase() as Priority;
    if (!['P0', 'P1', 'P2', 'P3'].includes(level)) {
      return res.status(400).json({ error: 'Invalid priority level. Use P0, P1, P2, or P3' });
    }
    const tasks = await storage.getTasksByPriority(level);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /tasks/project/:projectId - Filter by project
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const tasks = await storage.getTasksByProject(req.params.projectId);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /tasks/top - V2: Get top priority task
router.get('/top', async (_req: Request, res: Response) => {
  try {
    const task = await storage.getTopPriority();
    if (!task) {
      return res.json({ message: 'No tasks in queue' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch top priority task' });
  }
});

// GET /tasks/:id - Get task by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await storage.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /tasks - Create task
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateTaskDTO = req.body;
    if (!data.priority || !data.task || !data.project) {
      return res.status(400).json({ error: 'priority, task, and project are required' });
    }
    if (!['P0', 'P1', 'P2', 'P3'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority. Use P0, P1, P2, or P3' });
    }
    const task = await storage.createTask(data);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /tasks/:id - Update task
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateTaskDTO = req.body;
    if (data.priority && !['P0', 'P1', 'P2', 'P3'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority. Use P0, P1, P2, or P3' });
    }
    const task = await storage.updateTask(req.params.id, data);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /tasks/:id - Delete task
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteTask(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST /tasks/:id/context-switch - Log context switch (V3 prep)
router.post('/:id/context-switch', async (req: Request, res: Response) => {
  try {
    const task = await storage.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await storage.logContextSwitch(req.params.id);
    res.json({ message: 'Context switch logged', taskId: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log context switch' });
  }
});

// POST /tasks/:id/complete - Complete task with outcome (V3 prep)
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { outcome } = req.body;
    if (!outcome || !['completed', 'cancelled', 'deferred'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be completed, cancelled, or deferred' });
    }
    const record = await storage.completeTask(req.params.id, outcome);
    if (!record) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

export default router;
