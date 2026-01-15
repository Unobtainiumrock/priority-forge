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
  DragReorderEvent,
  OnlineLearnerState,
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
  DEFAULT_ONLINE_LEARNER_STATE,
  UpdateHeuristicWeightsDTO,
  LogDragReorderDTO,
  UpdateOnlineLearnerDTO,
  TaskWeights,
  Effort,
  Workspace,
  CreateWorkspaceDTO,
  WorkspaceMetadata,
} from '../types/schema';
import { StorageInterface } from './interface';
import { MinHeap, toWeightedTask, recalculateAllScores, getDefaultWeights } from '../heap';

const DATA_DIR = path.join(__dirname, '../../data');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');
const WORKSPACES_META_FILE = path.join(DATA_DIR, 'workspaces.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'progress.json'); // For migration

function getEmptyDatabase(): ProgressDatabase {
  return {
    version: 'v3.2',
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
    queueRebalanceEvents: [],
    // V3.2: Online learning
    dragReorderEvents: [],
    onlineLearnerState: { ...DEFAULT_ONLINE_LEARNER_STATE },
  };
}

// In-memory context switch counter (resets on restart, persisted on task completion)
const contextSwitchCounts: Map<string, number> = new Map();

export class JsonStorage implements StorageInterface {
  private db: ProgressDatabase;
  private currentWorkspaceId: string | null = null;
  
  /**
   * V3.1: Map-based task storage for O(1) lookups and guaranteed uniqueness
   * The Map is the source of truth; db.tasks is only used for JSON serialization
   */
  private taskMap: Map<string, WeightedTask> = new Map();
  
  private taskHeap: MinHeap<WeightedTask>;
  private onWrite: (() => Promise<void>) | null = null;

  constructor() {
    // Initialize workspace system
    this.initializeWorkspaces();
    // Load current workspace
    this.currentWorkspaceId = this.loadCurrentWorkspaceId();
    this.db = this.load();
    // Initialize Map from loaded tasks (with deduplication)
    this.initializeTaskMap();
    this.taskHeap = new MinHeap(this.getTaskArray());
  }
  
  /**
   * V4: Initialize workspace directories and metadata
   */
  private initializeWorkspaces(): void {
    if (!fs.existsSync(WORKSPACES_DIR)) {
      fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
    }
    
    // Migrate legacy database to default workspace if it exists
    if (fs.existsSync(LEGACY_DB_FILE) && !fs.existsSync(WORKSPACES_META_FILE)) {
      console.log('🔄 Migrating legacy database to default workspace...');
      const defaultWorkspaceId = 'default';
      const workspaceDir = path.join(WORKSPACES_DIR, defaultWorkspaceId);
      fs.mkdirSync(workspaceDir, { recursive: true });
      
      // Copy legacy database to workspace
      const workspaceDbFile = path.join(workspaceDir, 'progress.json');
      fs.copyFileSync(LEGACY_DB_FILE, workspaceDbFile);
      
      // Create workspace metadata
      const metadata: WorkspaceMetadata = {
        workspaces: [{
          id: defaultWorkspaceId,
          name: 'Default',
          description: 'Migrated from legacy database',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        currentWorkspaceId: defaultWorkspaceId,
      };
      fs.writeFileSync(WORKSPACES_META_FILE, JSON.stringify(metadata, null, 2));
      console.log('✅ Migration complete! Legacy database migrated to default workspace.');
    }
  }
  
  /**
   * V4: Load current workspace ID from metadata
   */
  private loadCurrentWorkspaceId(): string | null {
    if (!fs.existsSync(WORKSPACES_META_FILE)) {
      return null;
    }
    try {
      const metadata = JSON.parse(fs.readFileSync(WORKSPACES_META_FILE, 'utf-8')) as WorkspaceMetadata;
      return metadata.currentWorkspaceId || null;
    } catch {
      return null;
    }
  }
  
  /**
   * V4: Get workspace database file path
   */
  private getWorkspaceDbFile(workspaceId: string): string {
    const workspaceDir = path.join(WORKSPACES_DIR, workspaceId);
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    return path.join(workspaceDir, 'progress.json');
  }
  
  /**
   * V4: Load workspace metadata
   */
  private loadWorkspaceMetadata(): WorkspaceMetadata {
    if (!fs.existsSync(WORKSPACES_META_FILE)) {
      return {
        workspaces: [],
        currentWorkspaceId: null,
      };
    }
    try {
      return JSON.parse(fs.readFileSync(WORKSPACES_META_FILE, 'utf-8')) as WorkspaceMetadata;
    } catch {
      return {
        workspaces: [],
        currentWorkspaceId: null,
      };
    }
  }
  
  /**
   * V4: Save workspace metadata
   */
  private saveWorkspaceMetadata(metadata: WorkspaceMetadata): void {
    fs.writeFileSync(WORKSPACES_META_FILE, JSON.stringify(metadata, null, 2));
  }

  /**
   * Initialize the task Map from db.tasks array
   * Deduplicates by keeping the most "complete" version of each task
   */
  private initializeTaskMap(): void {
    this.taskMap.clear();
    let duplicatesFound = 0;
    
    for (const task of this.db.tasks) {
      const existing = this.taskMap.get(task.id);
      if (!existing) {
        this.taskMap.set(task.id, task);
      } else {
        duplicatesFound++;
        // Keep the completed one, or the newer one if same status
        if (task.status === 'complete' && existing.status !== 'complete') {
          this.taskMap.set(task.id, task);
        } else if (existing.status !== 'complete' && new Date(task.updatedAt) > new Date(existing.updatedAt)) {
          this.taskMap.set(task.id, task);
        }
        // Otherwise keep existing (first one wins)
      }
    }
    
    if (duplicatesFound > 0) {
      console.log(`🔧 V3.1: Deduplicated ${duplicatesFound} tasks during load`);
      // Sync db.tasks with deduplicated Map
      this.syncTasksArray();
    }
  }

  /**
   * Sync db.tasks array from taskMap (for JSON serialization)
   */
  private syncTasksArray(): void {
    this.db.tasks = Array.from(this.taskMap.values());
  }

  /**
   * Get tasks as array (from Map)
   */
  private getTaskArray(): WeightedTask[] {
    return Array.from(this.taskMap.values());
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
    
    // V4: Use workspace-specific database file
    const dbFile = this.currentWorkspaceId 
      ? this.getWorkspaceDbFile(this.currentWorkspaceId)
      : LEGACY_DB_FILE; // Fallback to legacy for migration
    
    if (!fs.existsSync(dbFile)) {
      const empty = getEmptyDatabase();
      fs.writeFileSync(dbFile, JSON.stringify(empty, null, 2));
      return empty;
    }
    const raw = fs.readFileSync(dbFile, 'utf-8');
    const db = JSON.parse(raw) as ProgressDatabase;
    
    // Migration chain: V1 → V2 → V3 → V3.2
    let migratedDb = db;
    
    // Migrate V1 to V2 if needed
    if (migratedDb.version === 'v1' || !migratedDb.heuristicWeights) {
      migratedDb = this.migrateToV2(migratedDb);
    }
    
    // Migrate V2 to V3 if needed
    if (migratedDb.version === 'v2' || !migratedDb.priorityChangeEvents) {
      migratedDb = this.migrateToV3(migratedDb);
    }
    
    // Migrate V3 to V3.2 if needed (online learning support)
    if (migratedDb.version === 'v3' || !migratedDb.dragReorderEvents) {
      migratedDb = this.migrateToV32(migratedDb);
    }
    
    return migratedDb;
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
    const dbFile = this.currentWorkspaceId 
      ? this.getWorkspaceDbFile(this.currentWorkspaceId)
      : LEGACY_DB_FILE;
    fs.writeFileSync(dbFile, JSON.stringify(v2Db, null, 2));
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
    const dbFile = this.currentWorkspaceId 
      ? this.getWorkspaceDbFile(this.currentWorkspaceId)
      : LEGACY_DB_FILE;
    fs.writeFileSync(dbFile, JSON.stringify(v3Db, null, 2));
    console.log('✅ Migration complete! Database is now V3.');
    
    return v3Db;
  }

  /**
   * Migrate V3 database to V3.2 format (adds online learning support)
   * Includes data imputation for existing events to ensure consistent shapes
   */
  private migrateToV32(db: ProgressDatabase): ProgressDatabase {
    console.log('🔄 Migrating database from V3 to V3.2 (Online Learning)...');
    
    // Data imputation: Ensure all existing events have required fields
    const imputedPriorityChangeEvents = (db.priorityChangeEvents || []).map(event => ({
      ...event,
      // Impute missing fields with sensible defaults
      queuePositionBefore: event.queuePositionBefore ?? -1,
      queuePositionAfter: event.queuePositionAfter ?? -1,
    }));
    
    const imputedTaskSelectionEvents = (db.taskSelectionEvents || []).map(event => ({
      ...event,
      // Impute missing fields
      selectedTaskRank: event.selectedTaskRank ?? 0,
      queueSize: event.queueSize ?? 1,
    }));
    
    const imputedQueueRebalanceEvents = (db.queueRebalanceEvents || []).map(event => ({
      ...event,
      // Ensure arrays exist
      significantChanges: event.significantChanges || [],
      topTasksBefore: event.topTasksBefore || [],
      topTasksAfter: event.topTasksAfter || [],
    }));
    
    // Impute completion records for ML training
    const imputedCompletionRecords = db.completionRecords.map(record => ({
      ...record,
      // Impute missing score fields (use 0 as neutral default)
      initialPriorityScore: record.initialPriorityScore ?? 0,
      finalPriorityScore: record.finalPriorityScore ?? 0,
    }));
    
    // Synthesize drag events from existing priority changes (for training continuity)
    // Each priority change can be interpreted as an implicit reorder preference
    const syntheticDragEvents: DragReorderEvent[] = imputedPriorityChangeEvents
      .filter(e => e.queuePositionBefore >= 0 && e.queuePositionAfter >= 0)
      .map(event => {
        const fromRank = event.queuePositionBefore;
        const toRank = event.queuePositionAfter;
        const direction = toRank < fromRank ? 'promoted' : 'demoted';
        
        return {
          id: `synthetic-${event.id}`,
          taskId: event.taskId,
          fromRank,
          toRank,
          direction,
          timestamp: event.timestamp,
          implicitPreferences: [], // Can't reconstruct without full queue state
          draggedTaskFeatures: {
            priority: event.newPriority,
            priorityScore: event.newScore,
            weights: {
              blockingCount: 0,
              crossProjectImpact: 0,
              timeSensitivity: 0,
              effortValueRatio: 5,
              dependencyDepth: 0,
            },
            hasDeadline: false,
            hasBlocking: false,
            hasDependencies: false,
          },
          queueSize: 0,
          tasksPassedIds: [],
        } as DragReorderEvent;
      });
    
    console.log(`  📊 Imputed ${imputedPriorityChangeEvents.length} priority change events`);
    console.log(`  📊 Imputed ${imputedTaskSelectionEvents.length} task selection events`);
    console.log(`  📊 Imputed ${imputedQueueRebalanceEvents.length} queue rebalance events`);
    console.log(`  📊 Imputed ${imputedCompletionRecords.length} completion records`);
    console.log(`  📊 Synthesized ${syntheticDragEvents.length} drag events from priority changes`);
    
    const v32Db: ProgressDatabase = {
      ...db,
      version: 'v3.2',
      priorityChangeEvents: imputedPriorityChangeEvents,
      taskSelectionEvents: imputedTaskSelectionEvents,
      queueRebalanceEvents: imputedQueueRebalanceEvents,
      completionRecords: imputedCompletionRecords,
      // New V3.2 fields
      dragReorderEvents: syntheticDragEvents,
      onlineLearnerState: { ...DEFAULT_ONLINE_LEARNER_STATE },
      lastUpdated: new Date().toISOString(),
    };
    
    // Save migrated database
    const dbFile = this.currentWorkspaceId 
      ? this.getWorkspaceDbFile(this.currentWorkspaceId)
      : LEGACY_DB_FILE;
    fs.writeFileSync(dbFile, JSON.stringify(v32Db, null, 2));
    console.log('✅ Migration complete! Database is now V3.2 with Online Learning support.');
    
    return v32Db;
  }

  private async save(): Promise<void> {
    // Sync array from Map before saving
    this.syncTasksArray();
    this.db.lastUpdated = new Date().toISOString();
    
    // V4: Save to workspace-specific database file
    const dbFile = this.currentWorkspaceId 
      ? this.getWorkspaceDbFile(this.currentWorkspaceId)
      : LEGACY_DB_FILE; // Fallback
    
    fs.writeFileSync(dbFile, JSON.stringify(this.db, null, 2));
    if (this.onWrite) {
      await this.onWrite();
    }
  }

  /**
   * Rebuild heap from current task Map (use after bulk operations)
   */
  private rebuildHeap(): void {
    this.taskHeap = new MinHeap(this.getTaskArray());
  }

  async getAll(): Promise<ProgressDatabase> {
    // Sync before returning
    this.syncTasksArray();
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

  // Tasks - V3.1 with Map-based storage
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
    // O(1) lookup via Map
    return this.taskMap.get(id) || null;
  }

  async getTasksByPriority(priority: Priority): Promise<WeightedTask[]> {
    return this.getTaskArray()
      .filter(t => t.priority === priority)
      .sort((a, b) => a.priorityScore - b.priorityScore);
  }

  async getTasksByProject(projectId: string): Promise<WeightedTask[]> {
    return this.getTaskArray()
      .filter(t => t.project === projectId)
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
      this.taskMap.delete(task.id);
      await this.save();
    }
    return task;
  }

  async createTask(data: CreateTaskDTO): Promise<WeightedTask> {
    const now = new Date().toISOString();
    const taskId = data.id || uuidv4();
    
    // V3.1: Check for duplicate ID - Map enforces uniqueness
    if (this.taskMap.has(taskId)) {
      throw new Error(`Task with ID "${taskId}" already exists. Use updateTask to modify existing tasks.`);
    }
    
    // Snapshot before state for rebalance logging
    const tasksBefore = this.getTaskArray();
    
    // Create base task
    const baseTask: Task = {
      id: taskId,
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
      this.getTaskArray(),
      this.db.heuristicWeights
    );

    // Add to Map (guaranteed unique due to check above)
    this.taskMap.set(weightedTask.id, weightedTask);
    
    // IMPORTANT: Recalculate ALL task weights since dependencies/blocking may have changed
    // e.g., if new task depends on existing task, that task's blockingCount increases
    if (data.dependencies?.length || data.blocking) {
      const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
      // Update Map with recalculated tasks
      for (const task of recalculated) {
        this.taskMap.set(task.id, task);
      }
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_created', tasksBefore, this.getTaskArray(), weightedTask.id);
    } else {
      this.taskHeap.push(weightedTask);
    }
    
    await this.save();
    
    // Return the updated version from Map (may have been recalculated)
    return this.taskMap.get(weightedTask.id) || weightedTask;
  }

  async updateTask(id: string, data: UpdateTaskDTO): Promise<WeightedTask | null> {
    const existingTask = this.taskMap.get(id);
    if (!existingTask) return null;
    
    // Snapshot before state for rebalance logging
    const tasksBefore = this.getTaskArray();
    
    const oldPriority = existingTask.priority;
    const oldScore = existingTask.priorityScore;
    const oldDependencies = existingTask.dependencies || [];
    const oldBlocking = existingTask.blocking;
    const oldStatus = existingTask.status;
    
    // Get queue position before update
    const sortedBefore = this.taskHeap.toSortedArray();
    const queuePositionBefore = sortedBefore.findIndex(t => t.id === id);
    
    // V3.3: Capture startedAt when transitioning to in_progress
    let startedAt = existingTask.startedAt;
    if (data.status === 'in_progress' && oldStatus !== 'in_progress' && !startedAt) {
      startedAt = new Date().toISOString();
      console.log(`📊 V3.3: Task ${id} started work at ${startedAt}`);
    }
    
    // Merge updates
    const updatedBase: WeightedTask = {
      ...existingTask,
      ...data,
      startedAt,  // V3.3: Preserve or set startedAt
      weights: data.weights 
        ? { ...existingTask.weights, ...data.weights }
        : existingTask.weights,
      updatedAt: new Date().toISOString(),
    };

    // Check if dependency graph changed (requires full recalculation)
    const dependenciesChanged = 
      JSON.stringify(data.dependencies) !== JSON.stringify(oldDependencies) ||
      data.blocking !== oldBlocking;

    // Update in Map
    this.taskMap.set(id, updatedBase);

    // Recalculate scores
    if (dependenciesChanged) {
      // Full recalculation needed - dependency graph changed
      const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
      for (const task of recalculated) {
        this.taskMap.set(task.id, task);
      }
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_updated', tasksBefore, this.getTaskArray(), id);
    } else {
      // Just recalculate this task
      const updatedTask = toWeightedTask(
        updatedBase,
        this.getTaskArray(),
        this.db.heuristicWeights
      );
      this.taskMap.set(id, updatedTask);
      this.taskHeap.update(id, updatedTask);
    }

    const finalTask = this.taskMap.get(id)!;
    
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
    if (!this.taskMap.has(id)) return false;
    
    // Snapshot before state for rebalance logging
    const tasksBefore = this.getTaskArray();
    
    const deletedTask = this.taskMap.get(id)!;
    const hadDependents = this.getTaskArray().some(t => 
      t.dependencies?.includes(id) || t.blocking === id
    );
    
    // Remove from Map
    this.taskMap.delete(id);
    contextSwitchCounts.delete(id);
    
    // Recalculate if deleted task was blocking others
    if (hadDependents || deletedTask.blocking || deletedTask.dependencies?.length) {
      const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
      this.taskMap.clear();
      for (const task of recalculated) {
        this.taskMap.set(task.id, task);
      }
      this.rebuildHeap();
      
      // Log rebalance event
      this.logRebalanceEvent('task_deleted', tasksBefore, this.getTaskArray(), id);
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
    const tasksBefore = this.getTaskArray();
    
    const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
    this.taskMap.clear();
    for (const task of recalculated) {
      this.taskMap.set(task.id, task);
    }
    this.rebuildHeap();
    
    // Log rebalance event
    this.logRebalanceEvent('weights_changed', tasksBefore, this.getTaskArray());
    
    await this.save();
    return this.taskHeap.toSortedArray();
  }

  /**
   * V2: Update heuristic weights and recalculate all scores
   */
  async updateHeuristicWeights(weights: UpdateHeuristicWeightsDTO): Promise<HeuristicWeights> {
    // Snapshot before state for rebalance logging
    const tasksBefore = this.getTaskArray();
    
    this.db.heuristicWeights = {
      ...this.db.heuristicWeights,
      ...weights,
    };
    
    // Recalculate all task scores with new weights
    const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
    this.taskMap.clear();
    for (const task of recalculated) {
      this.taskMap.set(task.id, task);
    }
    this.rebuildHeap();
    
    // Log rebalance event (weights changed always logs)
    this.logRebalanceEvent('weights_changed', tasksBefore, this.getTaskArray());
    
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
    const task = this.taskMap.get(taskId);
    if (!task) return null;

    // Snapshot before state for rebalance logging
    const tasksBefore = this.getTaskArray();

    const completedAt = new Date().toISOString();
    const createdAt = new Date(task.createdAt).getTime();
    const completedTime = new Date(completedAt).getTime();
    const hoursElapsed = (completedTime - createdAt) / (1000 * 60 * 60);

    // V3.3: Calculate actual work time (from startedAt, not createdAt)
    let actualWorkTime: number | undefined;
    if (task.startedAt) {
      const startedTime = new Date(task.startedAt).getTime();
      actualWorkTime = Math.round(((completedTime - startedTime) / (1000 * 60 * 60)) * 100) / 100;
      console.log(`📊 V3.3: Task ${taskId} work duration: ${actualWorkTime}h (started: ${task.startedAt})`);
    } else {
      console.log(`⚠️ V3.3: Task ${taskId} completed without startedAt - using queue time as fallback`);
    }

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
      // V3.3: Actual work duration tracking
      startedAt: task.startedAt,
      actualWorkTime,
    };

    this.db.completionRecords.push(record);
    contextSwitchCounts.delete(taskId);

    // Update task status in Map
    const updatedTask: WeightedTask = {
      ...task,
      status: 'complete',
      updatedAt: new Date().toISOString(),
    };
    this.taskMap.set(taskId, updatedTask);

    // Recalculate all tasks - completing a task changes dependency graph
    // Tasks that depended on this one now have lower dependencyDepth
    // Tasks blocked by this one now have different blocking relationships
    const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
    this.taskMap.clear();
    for (const t of recalculated) {
      this.taskMap.set(t.id, t);
    }
    this.rebuildHeap();
    
    // Log rebalance event
    this.logRebalanceEvent('task_completed', tasksBefore, this.getTaskArray(), taskId);
    
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
    const selectedTask = this.taskMap.get(selectedTaskId);
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
        completionsWithWorkTime: number;  // V3.3: How many completions have reliable work duration
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
        workTimeHours: number;     // V3.3: Actual work time (startedAt → completedAt)
        queueTimeHours: number;    // V3.3: Queue time (createdAt → startedAt)
        hasWorkTimeData: number;   // V3.3: 1 if workTimeHours is reliable, 0 if fallback
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
    const tasks = this.getTaskArray();
    
    const topSelections = taskSelectionEvents.filter(e => e.wasTopSelected).length;
    const selectionAccuracy = taskSelectionEvents.length > 0
      ? (topSelections / taskSelectionEvents.length) * 100
      : 0;

    // Data quality metrics
    const completionsWithScores = completionRecords.filter(
      r => r.initialPriorityScore !== undefined
    ).length;
    // V3.3: Track completions with actual work time data
    const completionsWithWorkTime = completionRecords.filter(
      r => r.actualWorkTime !== undefined
    ).length;
    const tasksWithEffort = tasks.filter(t => t.effort).length;
    const tasksWithDependencies = tasks.filter(
      t => t.dependencies && t.dependencies.length > 0
    ).length;

    // Priority mapping
    const priorityMap: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const effortMap: Record<string, number> = { low: 1, medium: 2, high: 3 };

    // ML-ready completions with defaults for missing values
    const mlCompletions = completionRecords.map(r => {
      const task = this.taskMap.get(r.taskId);
      const initialScore = r.initialPriorityScore ?? task?.priorityScore ?? 0;
      const finalScore = r.finalPriorityScore ?? task?.priorityScore ?? 0;
      // V3.3: Include work time and queue time separately
      const hasWorkTime = r.actualWorkTime !== undefined;
      const queueTimeHours = hasWorkTime && r.startedAt
        ? Math.round(((new Date(r.startedAt).getTime() - new Date(task?.createdAt || r.startedAt).getTime()) / (1000 * 60 * 60)) * 100) / 100
        : r.actualCompletionTime;  // Fallback: use total time as queue time
      return {
        taskId: r.taskId,
        completionTimeHours: r.actualCompletionTime,
        workTimeHours: r.actualWorkTime ?? r.actualCompletionTime,  // Fallback: use total time
        queueTimeHours,
        hasWorkTimeData: hasWorkTime ? 1 : 0,  // Flag for ML to know if data is reliable
        wasBlocking: r.wasBlocking ? 1 : 0,
        outcome: r.outcome,
        initialScore,
        finalScore,
        scoreDelta: finalScore - initialScore,
      };
    });

    // ML-ready tasks with defaults for missing values
    const mlTasks = tasks.map(t => ({
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
      tasks,
      heuristicWeights: this.db.heuristicWeights,
      summary: {
        totalCompletions: completionRecords.length,
        totalPriorityChanges: priorityChangeEvents.length,
        totalSelections: taskSelectionEvents.length,
        totalRebalances: queueRebalanceEvents.length,
        selectionAccuracy,
        dataQuality: {
          completionsWithScores,
          completionsWithWorkTime,  // V3.3: Tracks how many have actual work duration
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

  // ========== V3.2: Online Learning Methods ==========

  /**
   * V3.2: Log a drag-and-drop reorder event and optionally update weights
   * This is the core entry point for the online learning system.
   * 
   * @param dto - The drag reorder data from the frontend
   * @returns The created DragReorderEvent with applied weight updates
   */
  async logDragReorder(dto: LogDragReorderDTO): Promise<DragReorderEvent> {
    const { taskId, fromRank, toRank } = dto;
    
    // Get current sorted queue (non-completed tasks only)
    const sortedTasks = this.taskHeap.toSortedArray().filter(t => t.status !== 'complete');
    const draggedTask = sortedTasks.find(t => t.id === taskId);
    
    if (!draggedTask) {
      throw new Error(`Task ${taskId} not found in queue`);
    }
    
    const direction = toRank < fromRank ? 'promoted' : 'demoted';
    
    // Generate implicit pairwise preferences
    // If promoted (moved up), we prefer dragged task over tasks it passed
    // If demoted (moved down), tasks it passed are preferred over it
    const implicitPreferences: DragReorderEvent['implicitPreferences'] = [];
    const tasksPassedIds: string[] = [];
    
    if (direction === 'promoted') {
      // Task moved from rank 5 to rank 2 → prefers over tasks at 2, 3, 4
      for (let i = toRank; i < fromRank; i++) {
        if (i < sortedTasks.length) {
          const passedTask = sortedTasks[i];
          tasksPassedIds.push(passedTask.id);
          implicitPreferences.push({
            preferredTaskId: taskId,
            demotedTaskId: passedTask.id,
            scoreDiff: draggedTask.priorityScore - passedTask.priorityScore,
          });
        }
      }
    } else {
      // Task moved from rank 2 to rank 5 → tasks at 3, 4, 5 preferred over it
      for (let i = fromRank + 1; i <= toRank; i++) {
        if (i < sortedTasks.length) {
          const passedTask = sortedTasks[i];
          tasksPassedIds.push(passedTask.id);
          implicitPreferences.push({
            preferredTaskId: passedTask.id,
            demotedTaskId: taskId,
            scoreDiff: passedTask.priorityScore - draggedTask.priorityScore,
          });
        }
      }
    }
    
    // Compute weight update if online learning is enabled
    let appliedWeightDelta: Partial<HeuristicWeights> | undefined;
    const learnerState = this.db.onlineLearnerState || { ...DEFAULT_ONLINE_LEARNER_STATE };
    
    if (learnerState.enabled && implicitPreferences.length > 0) {
      appliedWeightDelta = await this.computeOnlineWeightUpdate(
        implicitPreferences,
        sortedTasks,
        learnerState
      );
    }
    
    // Create the drag event
    const event: DragReorderEvent = {
      id: uuidv4(),
      taskId,
      fromRank,
      toRank,
      direction,
      timestamp: new Date().toISOString(),
      implicitPreferences,
      draggedTaskFeatures: {
        priority: draggedTask.priority,
        priorityScore: draggedTask.priorityScore,
        weights: draggedTask.weights,
        effort: draggedTask.effort,
        hasDeadline: !!draggedTask.deadline,
        hasBlocking: !!draggedTask.blocking,
        hasDependencies: !!(draggedTask.dependencies && draggedTask.dependencies.length > 0),
      },
      appliedWeightDelta,
      queueSize: sortedTasks.length,
      tasksPassedIds,
    };
    
    // Store the event
    if (!this.db.dragReorderEvents) {
      this.db.dragReorderEvents = [];
    }
    this.db.dragReorderEvents.push(event);
    
    // Update learner state
    if (!this.db.onlineLearnerState) {
      this.db.onlineLearnerState = { ...DEFAULT_ONLINE_LEARNER_STATE };
    }
    this.db.onlineLearnerState.totalUpdates++;
    this.db.onlineLearnerState.lastUpdateTimestamp = new Date().toISOString();
    this.db.onlineLearnerState.totalPairs += implicitPreferences.length;
    
    // Count correct predictions (where heuristics agreed with user)
    const correctCount = implicitPreferences.filter(p => p.scoreDiff < 0).length;
    this.db.onlineLearnerState.correctPredictions += correctCount;
    
    console.log(`📊 V3.2: Logged drag reorder: ${taskId} ${fromRank} → ${toRank} (${direction})`);
    console.log(`  ↳ Generated ${implicitPreferences.length} pairwise preferences`);
    if (appliedWeightDelta) {
      console.log(`  ↳ Applied weight update:`, appliedWeightDelta);
    }
    
    await this.save();
    return event;
  }

  /**
   * V3.2: Compute and apply weight updates using SGD with momentum
   * 
   * The loss function is pairwise ranking loss (hinge loss):
   *   L = Σ max(0, margin - (score_preferred - score_demoted))
   * 
   * Gradient update moves weights to increase score of preferred task
   * relative to demoted task.
   */
  private async computeOnlineWeightUpdate(
    preferences: DragReorderEvent['implicitPreferences'],
    sortedTasks: WeightedTask[],
    learnerState: OnlineLearnerState
  ): Promise<Partial<HeuristicWeights>> {
    const { learningRate, momentum, maxWeightChange, minWeight, maxWeight } = learnerState;
    const taskMap = new Map(sortedTasks.map(t => [t.id, t]));
    
    // Accumulate gradients across all preferences
    const gradient: HeuristicWeights = {
      blocking: 0,
      crossProject: 0,
      timeSensitive: 0,
      effortValue: 0,
      dependency: 0,
    };
    
    const margin = 1.0; // Hinge loss margin
    let totalLoss = 0;
    
    for (const pref of preferences) {
      const preferred = taskMap.get(pref.preferredTaskId);
      const demoted = taskMap.get(pref.demotedTaskId);
      
      if (!preferred || !demoted) continue;
      
      // Current score difference (should be negative for correct prediction)
      const scoreDiff = preferred.priorityScore - demoted.priorityScore;
      
      // Hinge loss: max(0, margin + scoreDiff)
      // We want preferred.score < demoted.score (lower score = higher priority)
      const loss = Math.max(0, margin + scoreDiff);
      totalLoss += loss;
      
      if (loss > 0) {
        // Gradient: ∂L/∂w_i = (feature_preferred - feature_demoted)
        // We want to DECREASE score of preferred and INCREASE score of demoted
        // Since score = base - weighted_sum, we need to INCREASE features of preferred
        const prefWeights = preferred.weights;
        const demWeights = demoted.weights;
        
        gradient.blocking += (prefWeights.blockingCount - demWeights.blockingCount);
        gradient.crossProject += (prefWeights.crossProjectImpact - demWeights.crossProjectImpact);
        gradient.timeSensitive += (prefWeights.timeSensitivity - demWeights.timeSensitivity);
        gradient.effortValue += (prefWeights.effortValueRatio - demWeights.effortValueRatio);
        gradient.dependency += (prefWeights.dependencyDepth - demWeights.dependencyDepth);
      }
    }
    
    // Normalize gradient by number of preferences
    const n = preferences.length || 1;
    gradient.blocking /= n;
    gradient.crossProject /= n;
    gradient.timeSensitive /= n;
    gradient.effortValue /= n;
    gradient.dependency /= n;
    
    // Apply momentum
    const momentumBuffer = learnerState.momentumBuffer;
    momentumBuffer.blocking = momentum * momentumBuffer.blocking + gradient.blocking;
    momentumBuffer.crossProject = momentum * momentumBuffer.crossProject + gradient.crossProject;
    momentumBuffer.timeSensitive = momentum * momentumBuffer.timeSensitive + gradient.timeSensitive;
    momentumBuffer.effortValue = momentum * momentumBuffer.effortValue + gradient.effortValue;
    momentumBuffer.dependency = momentum * momentumBuffer.dependency + gradient.dependency;
    
    // Compute weight delta (clamped)
    const clamp = (val: number) => Math.max(-maxWeightChange, Math.min(maxWeightChange, val));
    const weightDelta: Partial<HeuristicWeights> = {
      blocking: clamp(learningRate * momentumBuffer.blocking),
      crossProject: clamp(learningRate * momentumBuffer.crossProject),
      timeSensitive: clamp(learningRate * momentumBuffer.timeSensitive),
      effortValue: clamp(learningRate * momentumBuffer.effortValue),
      dependency: clamp(learningRate * momentumBuffer.dependency),
    };
    
    // Apply to weights (with min/max bounds)
    const bound = (val: number) => Math.max(minWeight, Math.min(maxWeight, val));
    const newWeights: HeuristicWeights = {
      blocking: bound(this.db.heuristicWeights.blocking + (weightDelta.blocking || 0)),
      crossProject: bound(this.db.heuristicWeights.crossProject + (weightDelta.crossProject || 0)),
      timeSensitive: bound(this.db.heuristicWeights.timeSensitive + (weightDelta.timeSensitive || 0)),
      effortValue: bound(this.db.heuristicWeights.effortValue + (weightDelta.effortValue || 0)),
      dependency: bound(this.db.heuristicWeights.dependency + (weightDelta.dependency || 0)),
    };
    
    // Only update if there's meaningful change
    const hasChange = Object.values(weightDelta).some(v => v && Math.abs(v) > 0.001);
    if (hasChange) {
      this.db.heuristicWeights = newWeights;
      
      // Recalculate all task scores with new weights
      const recalculated = recalculateAllScores(this.getTaskArray(), this.db.heuristicWeights);
      this.taskMap.clear();
      for (const task of recalculated) {
        this.taskMap.set(task.id, task);
      }
      this.rebuildHeap();
      
      // Track cumulative loss
      this.db.onlineLearnerState!.cumulativeLoss += totalLoss;
    }
    
    return weightDelta;
  }

  /**
   * V3.2: Get current online learner state
   */
  async getOnlineLearnerState(): Promise<OnlineLearnerState> {
    return this.db.onlineLearnerState || { ...DEFAULT_ONLINE_LEARNER_STATE };
  }

  /**
   * V3.2: Update online learner configuration
   */
  async updateOnlineLearnerConfig(config: UpdateOnlineLearnerDTO): Promise<OnlineLearnerState> {
    if (!this.db.onlineLearnerState) {
      this.db.onlineLearnerState = { ...DEFAULT_ONLINE_LEARNER_STATE };
    }
    
    this.db.onlineLearnerState = {
      ...this.db.onlineLearnerState,
      ...config,
    };
    
    await this.save();
    console.log('📊 V3.2: Updated online learner config:', config);
    return this.db.onlineLearnerState;
  }

  /**
   * V3.2: Get all drag reorder events
   */
  async getDragReorderEvents(): Promise<DragReorderEvent[]> {
    return this.db.dragReorderEvents || [];
  }

  /**
   * V3.2: Get online learning accuracy metrics
   */
  async getOnlineLearnerMetrics(): Promise<{
    totalUpdates: number;
    totalPairs: number;
    correctPredictions: number;
    accuracy: number;
    cumulativeLoss: number;
    currentWeights: HeuristicWeights;
    learningRate: number;
    enabled: boolean;
  }> {
    const state = this.db.onlineLearnerState || { ...DEFAULT_ONLINE_LEARNER_STATE };
    const accuracy = state.totalPairs > 0 
      ? (state.correctPredictions / state.totalPairs) * 100 
      : 0;
    
    return {
      totalUpdates: state.totalUpdates,
      totalPairs: state.totalPairs,
      correctPredictions: state.correctPredictions,
      accuracy: Math.round(accuracy * 100) / 100,
      cumulativeLoss: Math.round(state.cumulativeLoss * 100) / 100,
      currentWeights: this.db.heuristicWeights,
      learningRate: state.learningRate,
      enabled: state.enabled,
    };
  }

  // ========== V4: Workspace Management Methods ==========

  /**
   * V4: Get all workspaces
   */
  async getWorkspaces(): Promise<Workspace[]> {
    const metadata = this.loadWorkspaceMetadata();
    return metadata.workspaces;
  }

  /**
   * V4: Get current workspace ID
   */
  async getCurrentWorkspaceId(): Promise<string | null> {
    return this.currentWorkspaceId;
  }

  /**
   * V4: Get workspace by ID
   */
  async getWorkspace(id: string): Promise<Workspace | null> {
    const metadata = this.loadWorkspaceMetadata();
    return metadata.workspaces.find(w => w.id === id) || null;
  }

  /**
   * V4: Create a new workspace
   */
  async createWorkspace(data: CreateWorkspaceDTO): Promise<Workspace> {
    const metadata = this.loadWorkspaceMetadata();
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: uuidv4(),
      name: data.name,
      description: data.description,
      createdAt: now,
      updatedAt: now,
    };
    
    metadata.workspaces.push(workspace);
    
    // If no current workspace, set this as current
    if (!metadata.currentWorkspaceId) {
      metadata.currentWorkspaceId = workspace.id;
      this.currentWorkspaceId = workspace.id;
    }
    
    this.saveWorkspaceMetadata(metadata);
    
    // Initialize workspace database (empty)
    const dbFile = this.getWorkspaceDbFile(workspace.id);
    if (!fs.existsSync(dbFile)) {
      const empty = getEmptyDatabase();
      fs.writeFileSync(dbFile, JSON.stringify(empty, null, 2));
    }
    
    console.log(`📁 V4: Created workspace "${workspace.name}" (${workspace.id})`);
    return workspace;
  }

  /**
   * V4: Get a seeded database with example data
   */
  private getSeededDatabase(): ProgressDatabase {
    const exampleProjectId = uuidv4();
    return {
      ...getEmptyDatabase(),
      projects: [
        {
          id: exampleProjectId,
          name: 'example-project',
          path: '~/projects/example',
          status: 'active',
          primaryFocus: 'Example project - replace with your own',
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
          notes: 'Delete this example and add your own tasks',
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
    };
  }

  /**
   * V4: Seed the current workspace with example data (if empty)
   */
  async seedCurrentWorkspace(): Promise<void> {
    if (!this.currentWorkspaceId) {
      throw new Error('No workspace is currently active');
    }

    const dbFile = this.getWorkspaceDbFile(this.currentWorkspaceId);
    
    // Only seed if database is empty
    if (fs.existsSync(dbFile)) {
      const existing = JSON.parse(fs.readFileSync(dbFile, 'utf-8')) as ProgressDatabase;
      if (existing.tasks.length > 0 || existing.projects.length > 0) {
        throw new Error('Workspace already has data. Cannot seed non-empty workspace.');
      }
    }

    const seeded = this.getSeededDatabase();
    fs.writeFileSync(dbFile, JSON.stringify(seeded, null, 2));
    
    // Reload the database
    this.db = this.load();
    this.initializeTaskMap();
    this.taskHeap = new MinHeap(this.getTaskArray());
    
    console.log(`📁 V4: Seeded workspace ${this.currentWorkspaceId} with example data`);
  }

  /**
   * V4: Switch to a different workspace
   */
  async switchWorkspace(workspaceId: string): Promise<void> {
    const metadata = this.loadWorkspaceMetadata();
    const workspace = metadata.workspaces.find(w => w.id === workspaceId);
    
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    
    // Save current workspace state before switching
    await this.save();
    
    // Switch workspace
    this.currentWorkspaceId = workspaceId;
    metadata.currentWorkspaceId = workspaceId;
    this.saveWorkspaceMetadata(metadata);
    
    // Reload database for new workspace
    this.db = this.load();
    this.initializeTaskMap();
    this.taskHeap = new MinHeap(this.getTaskArray());
    
    console.log(`📁 V4: Switched to workspace "${workspace.name}" (${workspaceId})`);
  }

  /**
   * V4: Delete a workspace
   */
  async deleteWorkspace(workspaceId: string): Promise<boolean> {
    const metadata = this.loadWorkspaceMetadata();
    const idx = metadata.workspaces.findIndex(w => w.id === workspaceId);
    
    if (idx === -1) {
      return false;
    }
    
    // Don't allow deleting the current workspace
    if (metadata.currentWorkspaceId === workspaceId) {
      throw new Error('Cannot delete the current workspace. Switch to another workspace first.');
    }
    
    // Remove workspace from metadata
    metadata.workspaces.splice(idx, 1);
    this.saveWorkspaceMetadata(metadata);
    
    // Delete workspace directory
    const workspaceDir = path.join(WORKSPACES_DIR, workspaceId);
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    
    console.log(`📁 V4: Deleted workspace ${workspaceId}`);
    return true;
  }
}

export const storage = new JsonStorage();
