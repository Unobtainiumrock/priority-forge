// Seed script to populate initial example data
// Run with: npx tsx scripts/seed.ts
//
// This creates a BLANK database with one example project and task.
// Users should add their own projects and tasks via the API.

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ProgressDatabase, DEFAULT_HEURISTIC_WEIGHTS } from '../src/types/schema';

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'progress.json');

const seedData: ProgressDatabase = {
  version: 'v2',
  lastUpdated: new Date().toISOString(),
  projects: [
    {
      id: uuidv4(),
      name: 'example-project',
      path: '~/projects/example',
      status: 'active',
      primaryFocus: 'Your project description here',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  tasks: [
    {
      id: 'EXAMPLE-001',
      priority: 'P1',
      task: 'Replace this with your first task',
      project: 'example-project',
      status: 'not_started',
      notes: 'Delete this example and add your own tasks via the API',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priorityScore: 82,
      weights: {
        blockingCount: 0,
        crossProjectImpact: 0,
        timeSensitivity: 0,
        effortValueRatio: 6,
        dependencyDepth: 0,
      },
    },
  ],
  dataGaps: [],
  decisions: [],
  completionRecords: [],
  heuristicWeights: { ...DEFAULT_HEURISTIC_WEIGHTS },
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Check if database already exists
if (fs.existsSync(DB_FILE)) {
  console.log('⚠️  Database already exists at:', DB_FILE);
  console.log('   To reset, delete the file first: rm data/progress.json');
  console.log('   Then run this script again.');
  process.exit(1);
}

// Write seed data
fs.writeFileSync(DB_FILE, JSON.stringify(seedData, null, 2));
console.log(`✅ Created new database with example data:`);
console.log(`   - 1 example project`);
console.log(`   - 1 example task`);
console.log(`\n📁 Data written to: ${DB_FILE}`);
console.log(`\n🚀 Next steps:`);
console.log(`   1. Start the server: npm run dev`);
console.log(`   2. Delete the example: DELETE /tasks/EXAMPLE-001`);
console.log(`   3. Add your projects: POST /projects`);
console.log(`   4. Add your tasks: POST /tasks`);
console.log(`\n📚 Or use MCP tools in Cursor:`);
console.log(`   - create_task { priority: "P0", task: "...", project: "..." }`);
