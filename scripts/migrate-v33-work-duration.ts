#!/usr/bin/env npx ts-node
/**
 * V3.3 Migration: Impute startedAt and actualWorkTime for historical data
 * 
 * This script retroactively adds work duration estimates to completion records
 * that were created before V3.3 introduced startedAt tracking.
 * 
 * Imputation Strategy:
 * - For short tasks (< 2h total time): 80% is work time, 20% queue time
 * - For medium tasks (2-8h): 50% work, 50% queue
 * - For long tasks (> 8h): 20% work, 80% queue (sat in backlog longer)
 * - Effort-based adjustment: low=0.8x, medium=1x, high=1.2x of base estimate
 * 
 * All imputed records are flagged so ML can weight them appropriately.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'progress.json');
const BACKUP_FILE = path.join(DATA_DIR, `progress.backup.${Date.now()}.json`);

interface ProgressDatabase {
  version: string;
  lastUpdated: string;
  tasks: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    effort?: 'low' | 'medium' | 'high';
    startedAt?: string;
    status: string;
  }>;
  completionRecords: Array<{
    id: string;
    taskId: string;
    actualCompletionTime: number;
    completedAt: string;
    outcome: string;
    startedAt?: string;
    actualWorkTime?: number;
    // Flag for imputed data
    _imputed?: boolean;
  }>;
  [key: string]: unknown;
}

function estimateWorkTime(
  totalHours: number,
  effort?: 'low' | 'medium' | 'high'
): { workTime: number; queueTime: number; confidence: 'low' | 'medium' | 'high' } {
  // Base work time ratio based on total duration
  let workRatio: number;
  let confidence: 'low' | 'medium' | 'high';
  
  if (totalHours < 0.5) {
    // Very short tasks - almost all work, minimal queue time
    workRatio = 0.9;
    confidence = 'high';
  } else if (totalHours < 2) {
    // Short tasks - mostly work
    workRatio = 0.8;
    confidence = 'high';
  } else if (totalHours < 8) {
    // Medium tasks - even split
    workRatio = 0.5;
    confidence = 'medium';
  } else if (totalHours < 24) {
    // Long tasks - mostly queue time
    workRatio = 0.3;
    confidence = 'medium';
  } else {
    // Very long tasks - almost all queue time
    workRatio = 0.2;
    confidence = 'low';
  }
  
  // Adjust based on effort (higher effort = more work time)
  const effortMultiplier = effort === 'low' ? 0.8 : effort === 'high' ? 1.2 : 1.0;
  workRatio = Math.min(0.95, workRatio * effortMultiplier);
  
  const workTime = Math.round(totalHours * workRatio * 100) / 100;
  const queueTime = Math.round((totalHours - workTime) * 100) / 100;
  
  return { workTime: Math.max(0.01, workTime), queueTime: Math.max(0, queueTime), confidence };
}

function migrateData(): void {
  console.log('🔄 V3.3 Migration: Imputing work duration data...\n');
  
  // Load database
  if (!fs.existsSync(DB_FILE)) {
    console.error('❌ Database file not found:', DB_FILE);
    process.exit(1);
  }
  
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const db: ProgressDatabase = JSON.parse(raw);
  
  // Create backup
  console.log(`📦 Creating backup: ${BACKUP_FILE}`);
  fs.writeFileSync(BACKUP_FILE, raw);
  
  // Build task lookup map
  const taskMap = new Map(db.tasks.map(t => [t.id, t]));
  
  // Track statistics
  let imputedCount = 0;
  let skippedCount = 0;
  let alreadyHasDataCount = 0;
  const confidenceCounts = { low: 0, medium: 0, high: 0 };
  
  // Process completion records
  for (const record of db.completionRecords) {
    // Skip if already has work time data
    if (record.startedAt && record.actualWorkTime !== undefined) {
      alreadyHasDataCount++;
      continue;
    }
    
    const task = taskMap.get(record.taskId);
    if (!task) {
      console.log(`  ⚠️ Skipping ${record.taskId}: task not found`);
      skippedCount++;
      continue;
    }
    
    // Calculate imputed values
    const { workTime, queueTime, confidence } = estimateWorkTime(
      record.actualCompletionTime,
      task.effort
    );
    
    // Calculate startedAt from completedAt - workTime
    const completedAt = new Date(record.completedAt);
    const startedAt = new Date(completedAt.getTime() - (workTime * 60 * 60 * 1000));
    
    // Ensure startedAt is not before createdAt
    const createdAt = new Date(task.createdAt);
    const finalStartedAt = startedAt < createdAt ? createdAt : startedAt;
    const actualWorkTime = Math.round(
      ((completedAt.getTime() - finalStartedAt.getTime()) / (1000 * 60 * 60)) * 100
    ) / 100;
    
    // Update record
    record.startedAt = finalStartedAt.toISOString();
    record.actualWorkTime = actualWorkTime;
    record._imputed = true;  // Flag as imputed for ML weighting
    
    imputedCount++;
    confidenceCounts[confidence]++;
    
    console.log(`  ✅ ${record.taskId}: ${record.actualCompletionTime}h total → ${actualWorkTime}h work (${confidence} confidence)`);
  }
  
  // Also update tasks that are complete but missing startedAt
  let tasksUpdated = 0;
  for (const task of db.tasks) {
    if (task.status === 'complete' && !task.startedAt) {
      // Find the completion record for this task
      const record = db.completionRecords.find(r => r.taskId === task.id);
      if (record?.startedAt) {
        task.startedAt = record.startedAt;
        tasksUpdated++;
      }
    }
  }
  
  // Update version and save
  db.version = 'v3.3';
  db.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  
  // Print summary
  console.log('\n📊 Migration Summary:');
  console.log(`   Total completion records: ${db.completionRecords.length}`);
  console.log(`   Already had work time data: ${alreadyHasDataCount}`);
  console.log(`   Imputed: ${imputedCount}`);
  console.log(`   Skipped (task not found): ${skippedCount}`);
  console.log(`   Tasks updated with startedAt: ${tasksUpdated}`);
  console.log('\n📈 Imputation Confidence:');
  console.log(`   High (short tasks): ${confidenceCounts.high}`);
  console.log(`   Medium (medium tasks): ${confidenceCounts.medium}`);
  console.log(`   Low (long tasks): ${confidenceCounts.low}`);
  console.log('\n✅ Migration complete! Database version: v3.3');
  console.log(`   Backup saved to: ${BACKUP_FILE}`);
}

// Run migration
migrateData();

