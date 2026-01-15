#!/usr/bin/env npx ts-node
/**
 * Migration Script: Normalize task status values
 * 
 * Problem: Database has both 'complete' and 'completed' status values
 * Solution: Normalize all 'completed' → 'complete' (canonical form)
 * 
 * Run: npx ts-node scripts/migrate-status-normalize.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

interface Task {
  id: string;
  status: string;
  [key: string]: unknown;
}

interface ProgressDatabase {
  version: string;
  tasks: Task[];
  completionRecords?: Array<{ outcome?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

function normalizeStatus(status: string): string {
  // Normalize 'completed' → 'complete'
  if (status === 'completed') {
    return 'complete';
  }
  return status;
}

function migrateFile(filePath: string): { tasksUpdated: number; recordsUpdated: number } {
  console.log(`\nProcessing: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const data: ProgressDatabase = JSON.parse(content);
  
  let tasksUpdated = 0;
  let recordsUpdated = 0;
  
  // Migrate task statuses
  if (data.tasks && Array.isArray(data.tasks)) {
    for (const task of data.tasks) {
      if (task.status === 'completed') {
        console.log(`  Task ${task.id}: 'completed' → 'complete'`);
        task.status = 'complete';
        tasksUpdated++;
      }
    }
  }
  
  // Note: We keep TaskOutcome as 'completed' | 'cancelled' | 'deferred' 
  // because that's the outcome type (what happened), not the status type (current state)
  // The outcome 'completed' means "task was finished successfully"
  // The status 'complete' means "task is in done state"
  
  if (tasksUpdated > 0 || recordsUpdated > 0) {
    // Update lastUpdated timestamp
    data.lastUpdated = new Date().toISOString();
    
    // Write back
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✅ Updated ${tasksUpdated} tasks, ${recordsUpdated} records`);
  } else {
    console.log(`  ✓ No changes needed`);
  }
  
  return { tasksUpdated, recordsUpdated };
}

function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Status Normalization Migration');
  console.log('  Normalizing: "completed" → "complete"');
  console.log('═══════════════════════════════════════════════════════════');
  
  let totalTasks = 0;
  let totalRecords = 0;
  
  // Migrate all workspace files
  if (fs.existsSync(WORKSPACES_DIR)) {
    const workspaces = fs.readdirSync(WORKSPACES_DIR);
    for (const workspace of workspaces) {
      const progressFile = path.join(WORKSPACES_DIR, workspace, 'progress.json');
      if (fs.existsSync(progressFile)) {
        const { tasksUpdated, recordsUpdated } = migrateFile(progressFile);
        totalTasks += tasksUpdated;
        totalRecords += recordsUpdated;
      }
    }
  }
  
  // Also check legacy progress.json in data root
  const legacyFile = path.join(DATA_DIR, 'progress.json');
  if (fs.existsSync(legacyFile)) {
    const { tasksUpdated, recordsUpdated } = migrateFile(legacyFile);
    totalTasks += tasksUpdated;
    totalRecords += recordsUpdated;
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Migration Complete!`);
  console.log(`  Tasks normalized: ${totalTasks}`);
  console.log(`  Records normalized: ${totalRecords}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main();
