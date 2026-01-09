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
