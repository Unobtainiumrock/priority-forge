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
import { CreateDataGapDTO, UpdateDataGapDTO } from '../types/schema';

const router = Router();

// GET /data-gaps - List all data gaps
router.get('/', async (_req: Request, res: Response) => {
  try {
    const gaps = await storage.getDataGaps();
    res.json(gaps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data gaps' });
  }
});

// GET /data-gaps/:id - Get data gap by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const gap = await storage.getDataGap(req.params.id);
    if (!gap) {
      return res.status(404).json({ error: 'Data gap not found' });
    }
    res.json(gap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data gap' });
  }
});

// POST /data-gaps - Create data gap
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateDataGapDTO = req.body;
    if (!data.element || !data.coverage || !data.priority || !data.impact || !data.effort) {
      return res.status(400).json({ 
        error: 'element, coverage, priority, impact, and effort are required' 
      });
    }
    if (!['P0', 'P1', 'P2', 'P3'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority. Use P0, P1, P2, or P3' });
    }
    if (!['low', 'medium', 'high'].includes(data.effort)) {
      return res.status(400).json({ error: 'Invalid effort. Use low, medium, or high' });
    }
    const gap = await storage.createDataGap(data);
    res.status(201).json(gap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create data gap' });
  }
});

// PUT /data-gaps/:id - Update data gap
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: UpdateDataGapDTO = req.body;
    if (data.priority && !['P0', 'P1', 'P2', 'P3'].includes(data.priority)) {
      return res.status(400).json({ error: 'Invalid priority. Use P0, P1, P2, or P3' });
    }
    if (data.effort && !['low', 'medium', 'high'].includes(data.effort)) {
      return res.status(400).json({ error: 'Invalid effort. Use low, medium, or high' });
    }
    const gap = await storage.updateDataGap(req.params.id, data);
    if (!gap) {
      return res.status(404).json({ error: 'Data gap not found' });
    }
    res.json(gap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update data gap' });
  }
});

// DELETE /data-gaps/:id - Delete data gap
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteDataGap(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Data gap not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete data gap' });
  }
});

export default router;
