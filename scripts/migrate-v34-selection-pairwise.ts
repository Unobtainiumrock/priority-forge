#!/usr/bin/env npx ts-node
/*
 * Priority Forge - V3.4 Migration Script
 * Imputes skippedTaskIds and implicitPreferences for historical TaskSelectionEvents
 * 
 * Run with: npx ts-node scripts/migrate-v34-selection-pairwise.ts
 * 
 * This migration:
 * 1. Reads the global ML training data file (data/ml-training.json)
 * 2. For each TaskSelectionEvent lacking V3.4 fields:
 *    - Imputes skippedTaskIds from topTaskId (minimum: we know at least top was skipped)
 *    - Generates implicitPreferences with topTask as the skipped preference
 * 3. Backs up original file and saves migrated data
 * 
 * Note: Historical events have limited data - we can only reconstruct the
 * top task preference, not the full queue state at selection time.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TaskSelectionEvent {
  id: string;
  selectedTaskId: string;
  selectedTaskScore: number;
  selectedTaskRank: number;
  topTaskId: string;
  topTaskScore: number;
  queueSize: number;
  wasTopSelected: boolean;
  timestamp: string;
  workspaceId?: string;
  // V3.4 fields to impute
  skippedTaskIds?: string[];
  implicitPreferences?: Array<{
    preferredTaskId: string;
    skippedTaskId: string;
    scoreDiff: number;
  }>;
  selectedTaskFeatures?: {
    priority: string;
    priorityScore: number;
    weights: Record<string, number>;
    effort?: string;
    hasDeadline: boolean;
    hasBlocking: boolean;
    hasDependencies: boolean;
  };
}

interface GlobalMLDatabase {
  version: string;
  lastUpdated: string;
  heuristicWeights: Record<string, number>;
  completionRecords: unknown[];
  priorityChangeEvents: unknown[];
  taskSelectionEvents: TaskSelectionEvent[];
  queueRebalanceEvents: unknown[];
  dragReorderEvents: unknown[];
  onlineLearnerState: unknown;
}

const DATA_DIR = path.join(__dirname, '../data');
const GLOBAL_ML_FILE = path.join(DATA_DIR, 'ml-training.json');

function main() {
  console.log('🔄 V3.4 Migration: Imputing historical TaskSelectionEvent pairwise data...\n');
  
  // Check if global ML file exists
  if (!fs.existsSync(GLOBAL_ML_FILE)) {
    console.log('❌ Global ML file not found:', GLOBAL_ML_FILE);
    console.log('   Nothing to migrate - this is a fresh install.');
    process.exit(0);
  }
  
  // Load global ML data
  const rawData = fs.readFileSync(GLOBAL_ML_FILE, 'utf-8');
  const mlData: GlobalMLDatabase = JSON.parse(rawData);
  
  console.log(`📊 Found ${mlData.taskSelectionEvents.length} task selection events`);
  
  // Count events needing migration
  const eventsNeedingMigration = mlData.taskSelectionEvents.filter(
    e => !e.implicitPreferences && !e.wasTopSelected
  );
  const eventsAlreadyMigrated = mlData.taskSelectionEvents.filter(
    e => e.implicitPreferences !== undefined
  );
  const topSelections = mlData.taskSelectionEvents.filter(e => e.wasTopSelected);
  
  console.log(`   ├─ Already migrated (has implicitPreferences): ${eventsAlreadyMigrated.length}`);
  console.log(`   ├─ Top selections (no skip data needed): ${topSelections.length}`);
  console.log(`   └─ Needing migration: ${eventsNeedingMigration.length}`);
  
  if (eventsNeedingMigration.length === 0) {
    console.log('\n✅ No events need migration. All done!');
    process.exit(0);
  }
  
  // Create backup
  const backupPath = `${GLOBAL_ML_FILE}.backup.${Date.now()}.json`;
  fs.copyFileSync(GLOBAL_ML_FILE, backupPath);
  console.log(`\n💾 Backup created: ${path.basename(backupPath)}`);
  
  // Migrate events
  let migratedCount = 0;
  let totalPairsGenerated = 0;
  
  for (const event of mlData.taskSelectionEvents) {
    // Skip events that already have the new fields or are top selections
    if (event.implicitPreferences !== undefined) {
      continue;
    }
    
    if (event.wasTopSelected) {
      // Top selection: no skipped tasks, empty arrays
      event.skippedTaskIds = [];
      event.implicitPreferences = [];
      continue;
    }
    
    // Non-top selection: we know at least the top task was skipped
    // We can't reconstruct the full queue, but we have the top recommendation
    event.skippedTaskIds = [event.topTaskId];
    
    // Generate single pairwise preference: user preferred selected over top
    event.implicitPreferences = [{
      preferredTaskId: event.selectedTaskId,
      skippedTaskId: event.topTaskId,
      // Positive scoreDiff means heuristics got it wrong (selected had higher/worse score)
      scoreDiff: event.selectedTaskScore - event.topTaskScore,
    }];
    
    // Note: We can't reconstruct selectedTaskFeatures without historical task data
    // Leave it undefined - this is acceptable for imputed data
    
    migratedCount++;
    totalPairsGenerated += event.implicitPreferences.length;
  }
  
  // Update timestamp and save
  mlData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(GLOBAL_ML_FILE, JSON.stringify(mlData, null, 2));
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   ├─ Events migrated: ${migratedCount}`);
  console.log(`   ├─ Pairwise preferences generated: ${totalPairsGenerated}`);
  console.log(`   └─ Note: Historical events only have top-task preference (partial data)`);
  
  // Summary of data quality
  const totalPairs = mlData.taskSelectionEvents.reduce(
    (sum, e) => sum + (e.implicitPreferences?.length || 0), 0
  );
  console.log(`\n📊 Post-migration data quality:`);
  console.log(`   ├─ Total task selection events: ${mlData.taskSelectionEvents.length}`);
  console.log(`   ├─ Events with pairwise data: ${mlData.taskSelectionEvents.filter(e => e.implicitPreferences && e.implicitPreferences.length > 0).length}`);
  console.log(`   └─ Total pairwise preferences: ${totalPairs}`);
}

main();
