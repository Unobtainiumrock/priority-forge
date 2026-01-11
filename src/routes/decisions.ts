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
import { CreateDecisionDTO } from '../types/schema';

const router = Router();

// GET /decisions - List all decisions (sorted by date, newest first)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const decisions = await storage.getDecisions();
    res.json(decisions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

// POST /decisions - Create decision
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateDecisionDTO = req.body;
    if (!data.date || !data.decision || !data.rationale) {
      return res.status(400).json({ error: 'date, decision, and rationale are required' });
    }
    const decision = await storage.createDecision(data);
    res.status(201).json(decision);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create decision' });
  }
});

export default router;
