// Seed script to populate initial data from the spec
// Run with: npx tsx scripts/seed.ts

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProgressDatabase } from '../src/types/schema';

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'progress.json');

const seedData: ProgressDatabase = {
  version: 'v1',
  lastUpdated: new Date().toISOString(),
  projects: [
    {
      id: uuidv4(),
      name: 'overlap-resolution',
      path: '~/Desktop/overlap-resolution',
      status: 'active',
      primaryFocus: 'Theory, documentation, experiments',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'marketplace-design',
      path: '~/Desktop/marketplace-design',
      status: 'complete',
      primaryFocus: 'Production Go RTB platform',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'stable-marriage',
      path: '~/Desktop/stable-marriage',
      status: 'active',
      primaryFocus: 'Dashboard frontend, Python pacing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'stag-hunt',
      path: '~/Desktop/stag-hunt',
      status: 'complete',
      primaryFocus: 'Advertiser cooperation game theory',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      name: 'analysis',
      path: '~/Desktop/analysis',
      status: 'active',
      primaryFocus: 'BPM/NER analysis (separate project)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  tasks: [
    // P0: Critical Path Items
    {
      id: 'DATA-001',
      priority: 'P0',
      task: 'Conversion tracking (CVR)',
      project: 'marketplace-design',
      status: 'not_started',
      blocking: 'eCPM formula incomplete',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'INT-001',
      priority: 'P0',
      task: 'Wire up v̂ᵢₜ from NN to bid calculation',
      project: 'overlap-resolution',
      status: 'not_started',
      blocking: 'Bidding pipeline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'INT-002',
      priority: 'P0',
      task: 'Wire up α price ceiling logic',
      project: 'overlap-resolution',
      status: 'not_started',
      blocking: 'Overpay protection',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ML-001',
      priority: 'P0',
      task: 'Train with 100K production data',
      project: 'marketplace-design',
      status: 'waiting',
      blocking: 'Model accuracy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // P1: High Priority
    {
      id: 'DATA-002',
      priority: 'P1',
      task: 'Add advertiser entity (campaign grouping)',
      project: 'marketplace-design',
      status: 'not_started',
      notes: 'Multi-campaign pacing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'INT-003',
      priority: 'P1',
      task: 'Full integration test (ad request → auction)',
      project: 'overlap-resolution',
      status: 'not_started',
      notes: 'E2E validation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'DASH-001',
      priority: 'P1',
      task: 'Chat interface for interpretability',
      project: 'stable-marriage',
      status: 'not_started',
      notes: 'Phase 7.2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'STAG-001',
      priority: 'P1',
      task: 'Integration with stable-marriage RTB',
      project: 'stag-hunt',
      status: 'not_started',
      notes: 'Data coalition → auction',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // P2: Medium Priority
    {
      id: 'DATA-003',
      priority: 'P2',
      task: 'Device/Geo context (3.2% → 80%+)',
      project: 'marketplace-design',
      status: 'not_started',
      notes: 'User segmentation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'EXP-001',
      priority: 'P2',
      task: 'Comparative analysis experiments',
      project: 'overlap-resolution',
      status: 'not_started',
      notes: 'Task 4',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'EKS-001',
      priority: 'P2',
      task: 'Resume EKS deployment',
      project: 'marketplace-design',
      status: 'blocked',
      notes: 'When ready for prod',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // P3: Lower Priority
    {
      id: 'DATA-004',
      priority: 'P3',
      task: 'User embeddings (replace hash)',
      project: 'marketplace-design',
      status: 'not_started',
      notes: 'Personalization',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ML-002',
      priority: 'P3',
      task: 'Improve Neural Network (direct eCPM)',
      project: 'overlap-resolution',
      status: 'not_started',
      notes: 'Task 5',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'DASH-002',
      priority: 'P3',
      task: 'Fix chart rendering warnings',
      project: 'stable-marriage',
      status: 'not_started',
      notes: 'Minor polish',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  dataGaps: [
    {
      id: uuidv4(),
      element: 'Conversions',
      coverage: '0%',
      priority: 'P0',
      impact: 'CRITICAL GAP - eCPM = P(click) × P(convert|click) × payout',
      effort: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      element: 'Advertiser entity',
      coverage: '0%',
      priority: 'P1',
      impact: 'Enables cross-campaign budget coordination',
      effort: 'low',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      element: 'Device/Geo context',
      coverage: '3.2%',
      priority: 'P2',
      impact: 'Better user segmentation for NN',
      effort: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      element: 'User embeddings',
      coverage: '0%',
      priority: 'P3',
      impact: 'Replace SHA256 hash with real embeddings',
      effort: 'high',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  decisions: [
    {
      id: uuidv4(),
      date: '2026-01-08',
      decision: 'Use Go backend, not Python',
      rationale: 'Performance for hot path',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      date: '2026-01-08',
      decision: 'REST API, not gRPC-Web',
      rationale: 'Simplicity for dashboard',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      date: '2026-01-08',
      decision: 'Pacing at advertiser level',
      rationale: 'Go backend is source of truth',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      date: '2026-01-09',
      decision: 'Separate CTR and CVR models',
      rationale: 'Different training populations',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      date: '2026-01-09',
      decision: 'Memoized selectors + throttled slider',
      rationale: 'Performance fix',
      createdAt: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      date: '2026-01-09',
      decision: 'HTTP MCP server with JSON storage',
      rationale: 'Team rollout capability, simple start with upgrade path to SQLite',
      createdAt: new Date().toISOString(),
    },
  ],
  completionRecords: [],
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Write seed data
fs.writeFileSync(DB_FILE, JSON.stringify(seedData, null, 2));
console.log(`✅ Seeded database with:`);
console.log(`   - ${seedData.projects.length} projects`);
console.log(`   - ${seedData.tasks.length} tasks`);
console.log(`   - ${seedData.dataGaps.length} data gaps`);
console.log(`   - ${seedData.decisions.length} decisions`);
console.log(`\n📁 Data written to: ${DB_FILE}`);
