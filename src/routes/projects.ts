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
import { CreateProjectDTO, UpdateProjectDTO } from '../types/schema';

const router = Router();

// GET /projects - List all projects
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await storage.getProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /projects/:id - Get project by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /projects - Create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateProjectDTO = req.body;
    if (!data.name || !data.path || !data.primaryFocus) {
      return res.status(400).json({ error: 'name, path, and primaryFocus are required' });
    }
    const project = await storage.createProject(data);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /projects/:id - Update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateProjectDTO = req.body;
    const project = await storage.updateProject(req.params.id, data);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /projects/:id - Delete project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
