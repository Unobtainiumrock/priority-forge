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

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  Task,
  WeightedTask,
  DataGap,
  Decision,
  TaskCompletionRecord,
  PriorityChangeEvent,
  TaskSelectionEvent,
  QueueRebalanceEvent,
  ProgressDatabase,
  CreateProjectDTO,
  UpdateProjectDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
  CreateDataGapDTO,
  UpdateDataGapDTO,
  CreateDecisionDTO,
  Priority,
  HeuristicWeights,
  DEFAULT_HEURISTIC_WEIGHTS,
  UpdateHeuristicWeightsDTO,
} from '../types/schema';
import { StorageInterface } from './interface';
import { MinHeap, toWeightedTask, recalculateAllScores, getDefaultWeights } from '../heap';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'progress.json');

function getEmptyDatabase(): ProgressDatabase {
  return {
    version: 'v3',
    lastUpdated: new Date().toISOString(),
    projects: [],
    tasks: [],
    dataGaps: [],
    decisions: [],
    completionRecords: [],
    heuristicWeights: { ...DEFAULT_HEURISTIC_WEIGHTS },
    // V3: ML training data
    priorityChangeEvents: [],
    taskSelectionEvents: [],
  };
}

// In-memory context switch counter (resets on restart, persisted on task completion)
const contextSwitchCounts: Map<string, number> = new Map();

export class JsonStorage implements StorageInterface {
  private db: ProgressDatabase;
  private taskHeap: MinHeap<WeightedTask>;
  private onWrite: (() => Promise<void>) | null = null;

  constructor() {
    this.db = this.load();
    this.taskHeap = new MinHeap(this.db.tasks);
  }

  setOnWriteCallback(callback: () => Promise<void>) {
    this.onWrite = callback;
  }

  /**
   * V3: Log a queue rebalance event for ML training
   * Captures before/after state when dependency graph changes
   */
  private logRebalanceEvent(
    trigger: QueueRebalanceEvent['trigger'],
    tasksBefore: WeightedTask[],
    tasksAfter: WeightedTask[],
    triggerTaskId?: string
  ): void {
    // Build rank maps
    const rankBefore = new Map<string, { rank: number; score: number }>();
    const rankAfter = new Map<string, { rank: number; score: number }>();
    
    tasksBefore
      .filter(t => t.status !== 'complete')
      .sort((a, b) => a.priorityScore - b.priorityScore)
      .forEach((t, idx) => rankBefore.set(t.id, { rank: idx, score: t.priorityScore }));
    
    tasksAfter
      .filter(t => t.status !== 'complete')
      .sort((a, b) => a.priorityScore - b.priorityScore)
      .forEach((t, idx) => rankAfter.set(t.id, { rank: idx, score: t.priorityScore }));

    // Find significant changes (rank changed by more than 2)
    const significantChanges: QueueRebalanceEvent['significantChanges'] = [];
    for (const [taskId, before] of rankBefore) {
      const after = rankAfter.get(taskId);
      if (after && Math.abs(before.rank - after.rank) > 2) {
        significantChanges.push({
          taskId,
          rankBefore: before.rank,
          rankAfter: after.rank,
          scoreBefore: before.score,
          scoreAfter: after.score,
        });
      }
    }

    // Only log if there were significant changes
    if (significantChanges.length === 0 && trigger !== 'weights_changed') {
      return;
    }

    const topBefore = [...rankBefore.entries()]
      .sort((a, b) => a[1].rank - b[1].rank)
      .slice(0, 3)
      .map(([id]) => id);
    
    const topAfter = [...rankAfter.entries()]
      .sort((a, b) => a[1].rank - b[1].rank)
      .slice(0, 3)
      .map(([id]) => id);

    const event: QueueRebalanceEvent = {
      id: uuidv4(),
      trigger,
      triggerTaskId,
      timestamp: new Date().toISOString(),
      queueSizeBefore: rankBefore.size,
      queueSizeAfter: rankAfter.size,
      significantChanges,
      topTasksBefore: topBefore,
      topTasksAfter: topAfter,
    };

    if (!this.db.queueRebalanceEvents) {
      this.db.queueRebalanceEvents = [];
    }
    this.db.queueRebalanceEvents.push(event);
    
    console.log(`📊 V3: Logged rebalance event (${trigger}): ${significantChanges.length} significant changes`);
  }

  private load(): ProgressDatabase {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const empty = getEmptyDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(raw) as ProgressDatabase;
    
    // Migrate V1 to V2 if needed
    if (db.version === 'v1' || !db.heuristicWeights) {
      return this.migrateToV3(this.migrateToV2(db));
    }
    
    // Migrate V2 to V3 if needed
    if (db.version === 'v2' || !db.priorityChangeEvents) {
      return this.migrateToV3(db);
    }
    
    return db;
  }

  /**
   * Migrate V1 database to V2 format
   */
  private migrateToV2(db: ProgressDatabase): ProgressDatabase {
    console.log('🔄 Migrating database from V1 to V2...');
    
    const heuristicWeights = db.heuristicWeights || { ...DEFAULT_HEURISTIC_WEIGHTS };
    
    // Convert all tasks to weighted tasks
    const weightedTasks = recalculateAllScores(db.tasks, heuristicWeights);
    
    const v2Db: ProgressDatabase = {
      ...db,
      version: 'v2',
      tasks: weightedTasks,
      heuristicWeights,
      lastUpdated: new Date().toISOString(),
    };
    
    // Save migrated database
    fs.writeFileSync(DB_FILE, JSON.stringify(v2Db, null, 2));
    console.log('✅ Migration complete! Database is now V2.');
    
    return v2Db;
  }

  /**
   * Migrate V2 database to V3 format (adds ML training data arrays)
   */
  private migrateToV3(db: ProgressDatabase): ProgressDatabase {
    console.log('🔄 Migrating database from V2 to V3...');
    
    const v3Db: ProgressDatabase = {
      ...db,
      version: 'v3',
      priorityChangeEvents: db.priorityChangeEvents || [],
      taskSelectionEvents: db.taskSelectionEvents || [],
      lastUpdated: new Date().toISOString(),
    };
    
    // Save migrated database
    fs.writeFileSync(DB_FILE, JSON.stringify(v3Db, null, 2));
    console.log('✅ Migration complete! Database is now V3.');
    
    return v3Db;
  }

  private async save(): Promise<void> {
    this.db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2));
    if (this.onWrite) {
      await this.onWrite();
    }
  }

  /**
   * Rebuild heap from current tasks (use after bulk operations)
   */
  private rebuildHeap(): void {
    this.taskHeap = new MinHeap(this.db.tasks);
  }

  async getAll(): Promise<ProgressDatabase> {
    return this.db;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return this.db.projects;
  }

  async getProject(id: string): Promise<Project | null> {
    return this.db.projects.find(p => p.id === id) || null;
  }

  async createProject(data: CreateProjectDTO): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      name: data.name,
      path: data.path,
      status: data.status || 'active',
      primaryFocus: data.primaryFocus,
      createdAt: now,
      updatedAt: now,
    };
    this.db.projects.push(project);
    await this.save();
    return project;
  }

  async updateProject(id: string, data: UpdateProjectDTO): Promise<Project | null> {
    const idx = this.db.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    
    this.db.projects[idx] = {
      ...this.db.projects[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.db.projects[idx];
  }

  async deleteProject(id: string): Promise<boolean> {
    const idx = this.db.projects.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.db.projects.splice(idx, 1);
    await this.save();
    return true;
  }

  // Tasks - V2 with heap-based ordering
  async getTasks(includeCompleted: boolean = false): Promise<WeightedTask[]> {
    // Return sorted by priority score (lowest first = highest priority)
    const all = this.taskHeap.toSortedArray();
    if (includeCompleted) {
      return all;
    }
    // Filter out completed tasks by default
    return all.filter(t => t.status !== 'complete');
  }

  /**
   * Get all tasks including completed (for history/archival purposes)
   */
  async getAllTasks(): Promise<WeightedTask[]> {
    return this.taskHeap.toSortedArray();
  }

  /**
   * Get completed tasks only
   */
  async getCompletedTasks(): Promise<WeightedTask[]> {
    return this.taskHeap.toSortedArray().filter(t => t.status === 'complete');
  }

  async getTask(id: string): Promise<WeightedTask | null> {
    return this.taskHeap.get(id);
  }

  async getTasksByPriority(priority: Priority): Promise<WeightedTask[]> {
    return this.db.tasks.filter(t => t.priority === priority)
      .sort((a, b) => a.priorityScore - b.priorityScore);
  }

  async getTasksByProject(projectId: string): Promise<WeightedTask[]> {
    return this.db.tasks.filter(t => t.project === projectId)
      .sort((a, b) => a.priorityScore - b.priorityScore);
  }

  /**
   * V2: Get the single highest priority task (excludes completed tasks)
   */
  async getTopPriority(): Promise<WeightedTask | null> {
    // Get all tasks sorted by priority and find the first non-completed one
    const sorted = this.taskHeap.toSortedArray();
    return sorted.find(t => t.status !== 'complete') || null;
  }

  /**
   * V2: Pop the highest priority task (removes from queue)
   */
  async popTopPriority(): Promise<WeightedTask | null> {
    const task = this.taskHeap.pop();
    if (task) {
      const idx = this.db.tasks.findIndex(t => t.id === task.id);
      if (idx !== -1) {
        this.db.tasks.splice(idx, 1);
        await this.save();
      }
    }
    return task;
  }

  async createTask(data: CreateTaskDTO): Promise<WeightedTask> {
    const now = new Date().toISOString();
    
    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];
    
    // Create base task
    const baseTask: Task = {
      id: data.id || uuidv4(),
      priority: data.priority,
      task: data.task,
      project: data.project,
      status: data.status || 'not_started',
      blocking: data.blocking,
      dependencies: data.dependencies,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };

    // Convert to weighted task with computed scores
    const weightedTask = toWeightedTask(
      {
        ...baseTask,
        deadline: data.deadline,
        effort: data.effort,
        weights: data.weights ? { ...getDefaultWeights(), ...data.weights } : undefined,
      } as WeightedTask,
      this.db.tasks,
      this.db.heuristicWeights
    );

    // Add to database
    this.db.tasks.push(weightedTask);
    
    // IMPORTANT: Recalculate ALL task weights since dependencies/blocking may have changed
    // e.g., if new task depends on existing task, that task's blockingCount increases
    if (data.dependencies?.length || data.blocking) {
      this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_created', tasksBefore, this.db.tasks, weightedTask.id);
    } else {
      this.taskHeap.push(weightedTask);
    }
    
    await this.save();
    
    // Return the updated version from db (may have been recalculated)
    return this.db.tasks.find(t => t.id === weightedTask.id) || weightedTask;
  }

  async updateTask(id: string, data: UpdateTaskDTO): Promise<WeightedTask | null> {
    const idx = this.db.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    
    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];
    
    const existingTask = this.db.tasks[idx];
    const oldPriority = existingTask.priority;
    const oldScore = existingTask.priorityScore;
    const oldDependencies = existingTask.dependencies || [];
    const oldBlocking = existingTask.blocking;
    
    // Get queue position before update
    const sortedBefore = this.taskHeap.toSortedArray();
    const queuePositionBefore = sortedBefore.findIndex(t => t.id === id);
    
    // Merge updates
    const updatedBase: WeightedTask = {
      ...existingTask,
      ...data,
      weights: data.weights 
        ? { ...existingTask.weights, ...data.weights }
        : existingTask.weights,
      updatedAt: new Date().toISOString(),
    };

    // Check if dependency graph changed (requires full recalculation)
    const dependenciesChanged = 
      JSON.stringify(data.dependencies) !== JSON.stringify(oldDependencies) ||
      data.blocking !== oldBlocking;

    // Update in database first
    this.db.tasks[idx] = updatedBase;

    // Recalculate scores
    if (dependenciesChanged) {
      // Full recalculation needed - dependency graph changed
      this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_updated', tasksBefore, this.db.tasks, id);
    } else {
      // Just recalculate this task
      const updatedTask = toWeightedTask(
        updatedBase,
        this.db.tasks,
        this.db.heuristicWeights
      );
      this.db.tasks[idx] = updatedTask;
      this.taskHeap.update(id, updatedTask);
    }

    const finalTask = this.db.tasks[idx];
    
    // V3: Log priority change event if priority changed
    if (data.priority && data.priority !== oldPriority) {
      const sortedAfter = this.taskHeap.toSortedArray();
      const queuePositionAfter = sortedAfter.findIndex(t => t.id === id);
      
      const changeEvent: PriorityChangeEvent = {
        id: uuidv4(),
        taskId: id,
        oldPriority,
        newPriority: data.priority,
        oldScore,
        newScore: finalTask.priorityScore,
        timestamp: new Date().toISOString(),
        queuePositionBefore,
        queuePositionAfter,
      };
      
      if (!this.db.priorityChangeEvents) {
        this.db.priorityChangeEvents = [];
      }
      this.db.priorityChangeEvents.push(changeEvent);
      
      console.log(`📊 V3: Logged priority change for ${id}: ${oldPriority} → ${data.priority}`);
    }
    
    await this.save();
    return finalTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const idx = this.db.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    
    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];
    
    const deletedTask = this.db.tasks[idx];
    const hadDependents = this.db.tasks.some(t => 
      t.dependencies?.includes(id) || t.blocking === id
    );
    
    this.db.tasks.splice(idx, 1);
    contextSwitchCounts.delete(id);
    
    // Recalculate if deleted task was blocking others
    if (hadDependents || deletedTask.blocking || deletedTask.dependencies?.length) {
      this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_deleted', tasksBefore, this.db.tasks, id);
    } else {
      this.taskHeap.remove(id);
    }
    
    await this.save();
    return true;
  }

  /**
   * V2: Recalculate all priority scores
   * Useful after changing heuristic weights or bulk updates
   */
  async recalculateAllPriorities(): Promise<WeightedTask[]> {
    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];
    
    this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
    this.rebuildHeap();
    
    // Log rebalance event
    this.logRebalanceEvent('weights_changed', tasksBefore, this.db.tasks);
    
    await this.save();
    return this.taskHeap.toSortedArray();
  }

  /**
   * V2: Update heuristic weights and recalculate all scores
   */
  async updateHeuristicWeights(weights: UpdateHeuristicWeightsDTO): Promise<HeuristicWeights> {
    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];
    
    this.db.heuristicWeights = {
      ...this.db.heuristicWeights,
      ...weights,
    };
    
    // Recalculate all task scores with new weights
    this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
    this.rebuildHeap();
    
    // Log rebalance event (weights changed always logs)
    this.logRebalanceEvent('weights_changed', tasksBefore, this.db.tasks);
    
    await this.save();
    
    return this.db.heuristicWeights;
  }

  /**
   * V2: Get current heuristic weights
   */
  async getHeuristicWeights(): Promise<HeuristicWeights> {
    return this.db.heuristicWeights;
  }

  // Data Gaps
  async getDataGaps(): Promise<DataGap[]> {
    const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...this.db.dataGaps].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  async getDataGap(id: string): Promise<DataGap | null> {
    return this.db.dataGaps.find(d => d.id === id) || null;
  }

  async createDataGap(data: CreateDataGapDTO): Promise<DataGap> {
    const now = new Date().toISOString();
    const gap: DataGap = {
      id: uuidv4(),
      element: data.element,
      coverage: data.coverage,
      priority: data.priority,
      impact: data.impact,
      effort: data.effort,
      createdAt: now,
      updatedAt: now,
    };
    this.db.dataGaps.push(gap);
    await this.save();
    return gap;
  }

  async updateDataGap(id: string, data: UpdateDataGapDTO): Promise<DataGap | null> {
    const idx = this.db.dataGaps.findIndex(d => d.id === id);
    if (idx === -1) return null;
    
    this.db.dataGaps[idx] = {
      ...this.db.dataGaps[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.db.dataGaps[idx];
  }

  async deleteDataGap(id: string): Promise<boolean> {
    const idx = this.db.dataGaps.findIndex(d => d.id === id);
    if (idx === -1) return false;
    this.db.dataGaps.splice(idx, 1);
    await this.save();
    return true;
  }

  // Decisions
  async getDecisions(): Promise<Decision[]> {
    return [...this.db.decisions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async createDecision(data: CreateDecisionDTO): Promise<Decision> {
    const decision: Decision = {
      id: uuidv4(),
      date: data.date,
      decision: data.decision,
      rationale: data.rationale,
      createdAt: new Date().toISOString(),
    };
    this.db.decisions.push(decision);
    await this.save();
    return decision;
  }

  // V3 Prep: Context Switch Tracking
  async logContextSwitch(taskId: string): Promise<void> {
    const count = contextSwitchCounts.get(taskId) || 0;
    contextSwitchCounts.set(taskId, count + 1);
  }

  async completeTask(
    taskId: string,
    outcome: 'completed' | 'cancelled' | 'deferred'
  ): Promise<TaskCompletionRecord | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    // Snapshot before state for rebalance logging
    const tasksBefore = [...this.db.tasks];

    const completedAt = new Date().toISOString();
    const createdAt = new Date(task.createdAt).getTime();
    const completedTime = new Date(completedAt).getTime();
    const hoursElapsed = (completedTime - createdAt) / (1000 * 60 * 60);

    // Count priority changes for this task
    const priorityChangeCount = (this.db.priorityChangeEvents || [])
      .filter(e => e.taskId === taskId).length;

    const record: TaskCompletionRecord = {
      id: uuidv4(),
      taskId,
      actualCompletionTime: Math.round(hoursElapsed * 100) / 100,
      wasBlocking: !!task.blocking,
      userOverrideCount: priorityChangeCount,
      contextSwitchCount: contextSwitchCounts.get(taskId) || 0,
      outcome,
      completedAt,
      // V3: Capture score at completion for training
      initialPriorityScore: task.priorityScore,
      finalPriorityScore: task.priorityScore,
    };

    this.db.completionRecords.push(record);
    contextSwitchCounts.delete(taskId);

    // Update task status (this will trigger recalculation if task was blocking others)
    const idx = this.db.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      this.db.tasks[idx] = {
        ...this.db.tasks[idx],
        status: 'complete',
        updatedAt: new Date().toISOString(),
      };
    }

    // Recalculate all tasks - completing a task changes dependency graph
    // Tasks that depended on this one now have lower dependencyDepth
    // Tasks blocked by this one now have different blocking relationships
    this.db.tasks = recalculateAllScores(this.db.tasks, this.db.heuristicWeights);
    this.rebuildHeap();
    
    // Log rebalance event
    this.logRebalanceEvent('task_completed', tasksBefore, this.db.tasks, taskId);
    
    await this.save();
    return record;
  }

  async getCompletionRecords(): Promise<TaskCompletionRecord[]> {
    return this.db.completionRecords;
  }

  // ========== V3: ML Training Data Methods ==========

  /**
   * V3: Log when user selects a task to work on
   * This captures user preference signals for training
   */
  async logTaskSelection(selectedTaskId: string): Promise<TaskSelectionEvent | null> {
    const selectedTask = await this.getTask(selectedTaskId);
    if (!selectedTask) return null;

    const sorted = this.taskHeap.toSortedArray().filter(t => t.status !== 'complete');
    const topTask = sorted[0];
    const selectedRank = sorted.findIndex(t => t.id === selectedTaskId);

    const event: TaskSelectionEvent = {
      id: uuidv4(),
      selectedTaskId,
      selectedTaskScore: selectedTask.priorityScore,
      selectedTaskRank: selectedRank,
      topTaskId: topTask?.id || selectedTaskId,
      topTaskScore: topTask?.priorityScore || selectedTask.priorityScore,
      queueSize: sorted.length,
      wasTopSelected: selectedTaskId === topTask?.id,
      timestamp: new Date().toISOString(),
    };

    if (!this.db.taskSelectionEvents) {
      this.db.taskSelectionEvents = [];
    }
    this.db.taskSelectionEvents.push(event);
    
    console.log(`📊 V3: Logged task selection: ${selectedTaskId} (rank ${selectedRank + 1}/${sorted.length}, was_top: ${event.wasTopSelected})`);
    
    await this.save();
    return event;
  }

  /**
   * V3: Get all priority change events
   */
  async getPriorityChangeEvents(): Promise<PriorityChangeEvent[]> {
    return this.db.priorityChangeEvents || [];
  }

  /**
   * V3: Get all task selection events
   */
  async getTaskSelectionEvents(): Promise<TaskSelectionEvent[]> {
    return this.db.taskSelectionEvents || [];
  }

  /**
   * V3: Get all queue rebalance events
   */
  async getQueueRebalanceEvents(): Promise<QueueRebalanceEvent[]> {
    return this.db.queueRebalanceEvents || [];
  }

  /**
   * V3: Export training data for XGBoost
   * Returns structured data ready for ML training
   * Handles null values with sensible defaults for backward compatibility
   */
  async exportTrainingData(): Promise<{
    completionRecords: TaskCompletionRecord[];
    priorityChangeEvents: PriorityChangeEvent[];
    taskSelectionEvents: TaskSelectionEvent[];
    queueRebalanceEvents: QueueRebalanceEvent[];
    tasks: WeightedTask[];
    heuristicWeights: HeuristicWeights;
    summary: {
      totalCompletions: number;
      totalPriorityChanges: number;
      totalSelections: number;
      totalRebalances: number;
      selectionAccuracy: number;
      dataQuality: {
        completionsWithScores: number;
        tasksWithEffort: number;
        tasksWithDependencies: number;
        rebalancesWithSignificantChanges: number;
      };
    };
    // ML-ready format with nulls handled
    mlReady: {
      completions: Array<{
        taskId: string;
        completionTimeHours: number;
        wasBlocking: number;  // 0 or 1
        outcome: string;
        initialScore: number;
        finalScore: number;
        scoreDelta: number;
      }>;
      tasks: Array<{
        id: string;
        priority: number;  // P0=0, P1=1, P2=2, P3=3
        priorityScore: number;
        effort: number;  // low=1, medium=2, high=3, unknown=2
        blockingCount: number;
        crossProjectImpact: number;
        timeSensitivity: number;
        effortValueRatio: number;
        dependencyDepth: number;
        hasDependencies: number;  // 0 or 1
        hasBlocking: number;  // 0 or 1
      }>;
      // V3: Rebalance trajectory data
      rebalances: Array<{
        trigger: string;
        queueSizeBefore: number;
        queueSizeAfter: number;
        significantChangeCount: number;
        topTaskChanged: number;  // 0 or 1
      }>;
    };
  }> {
    const completionRecords = this.db.completionRecords;
    const priorityChangeEvents = this.db.priorityChangeEvents || [];
    const taskSelectionEvents = this.db.taskSelectionEvents || [];
    const queueRebalanceEvents = this.db.queueRebalanceEvents || [];
    
    const topSelections = taskSelectionEvents.filter(e => e.wasTopSelected).length;
    const selectionAccuracy = taskSelectionEvents.length > 0
      ? (topSelections / taskSelectionEvents.length) * 100
      : 0;

    // Data quality metrics
    const completionsWithScores = completionRecords.filter(
      r => r.initialPriorityScore !== undefined
    ).length;
    const tasksWithEffort = this.db.tasks.filter(t => t.effort).length;
    const tasksWithDependencies = this.db.tasks.filter(
      t => t.dependencies && t.dependencies.length > 0
    ).length;

    // Priority mapping
    const priorityMap: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const effortMap: Record<string, number> = { low: 1, medium: 2, high: 3 };

    // ML-ready completions with defaults for missing values
    const mlCompletions = completionRecords.map(r => {
      const task = this.db.tasks.find(t => t.id === r.taskId);
      const initialScore = r.initialPriorityScore ?? task?.priorityScore ?? 0;
      const finalScore = r.finalPriorityScore ?? task?.priorityScore ?? 0;
      return {
        taskId: r.taskId,
        completionTimeHours: r.actualCompletionTime,
        wasBlocking: r.wasBlocking ? 1 : 0,
        outcome: r.outcome,
        initialScore,
        finalScore,
        scoreDelta: finalScore - initialScore,
      };
    });

    // ML-ready tasks with defaults for missing values
    const mlTasks = this.db.tasks.map(t => ({
      id: t.id,
      priority: priorityMap[t.priority] ?? 1,
      priorityScore: t.priorityScore,
      effort: effortMap[t.effort || 'medium'] ?? 2,  // Default: medium
      blockingCount: t.weights?.blockingCount ?? 0,
      crossProjectImpact: t.weights?.crossProjectImpact ?? 0,
      timeSensitivity: t.weights?.timeSensitivity ?? 0,
      effortValueRatio: t.weights?.effortValueRatio ?? 5,
      dependencyDepth: t.weights?.dependencyDepth ?? 0,
      hasDependencies: (t.dependencies && t.dependencies.length > 0) ? 1 : 0,
      hasBlocking: t.blocking ? 1 : 0,
    }));

    // ML-ready rebalance events
    const mlRebalances = queueRebalanceEvents.map(r => ({
      trigger: r.trigger,
      queueSizeBefore: r.queueSizeBefore,
      queueSizeAfter: r.queueSizeAfter,
      significantChangeCount: r.significantChanges.length,
      topTaskChanged: r.topTasksBefore[0] !== r.topTasksAfter[0] ? 1 : 0,
    }));

    // Rebalances with significant changes
    const rebalancesWithSignificantChanges = queueRebalanceEvents.filter(
      r => r.significantChanges.length > 0
    ).length;

    return {
      completionRecords,
      priorityChangeEvents,
      taskSelectionEvents,
      queueRebalanceEvents,
      tasks: this.db.tasks,
      heuristicWeights: this.db.heuristicWeights,
      summary: {
        totalCompletions: completionRecords.length,
        totalPriorityChanges: priorityChangeEvents.length,
        totalSelections: taskSelectionEvents.length,
        totalRebalances: queueRebalanceEvents.length,
        selectionAccuracy,
        dataQuality: {
          completionsWithScores,
          tasksWithEffort,
          tasksWithDependencies,
          rebalancesWithSignificantChanges,
        },
      },
      mlReady: {
        completions: mlCompletions,
        tasks: mlTasks,
        rebalances: mlRebalances,
      },
    };
  }
}

export const storage = new JsonStorage();
