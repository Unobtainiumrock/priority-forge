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

// V2 Schema with Heap-Based Priority Queue

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type ProjectStatus = 'active' | 'complete' | 'blocked' | 'shelved';
export type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'waiting';
export type Effort = 'low' | 'medium' | 'high';
export type TaskOutcome = 'completed' | 'cancelled' | 'deferred';

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  primaryFocus: string;
  createdAt: string;
  updatedAt: string;
}

// V2: Weight factors for priority scoring
export interface TaskWeights {
  blockingCount: number;      // How many tasks this blocks (0-10)
  crossProjectImpact: number; // Affects multiple projects? (0-1)
  timeSensitivity: number;    // Deadline proximity (0-10, 10 = urgent)
  effortValueRatio: number;   // Quick wins score higher (0-10)
  dependencyDepth: number;    // How deep in dependency chain (0-5)
}

// V2: Heuristic weight multipliers (tunable)
export interface HeuristicWeights {
  blocking: number;      // Default: 10.0 - High weight: unblocks other work
  crossProject: number;  // Default: 5.0 - Medium: affects system integration
  timeSensitive: number; // Default: 8.0 - High: deadlines matter
  effortValue: number;   // Default: 3.0 - Lower: nice but not critical
  dependency: number;    // Default: 2.0 - Lower: context for ordering
}

export const DEFAULT_HEURISTIC_WEIGHTS: HeuristicWeights = {
  blocking: 10.0,
  crossProject: 5.0,
  timeSensitive: 8.0,
  effortValue: 3.0,
  dependency: 2.0,
};

// Base Task interface (V1 compatible)
export interface Task {
  id: string;
  priority: Priority;
  task: string;
  project: string;
  status: TaskStatus;
  blocking?: string;
  dependencies?: string[];  // Task IDs this depends on
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// V2: Extended task with computed priority score
export interface WeightedTask extends Task {
  priorityScore: number;  // Computed score (lower = higher priority)
  weights: TaskWeights;
  // V2 additions for better scoring
  deadline?: string;      // ISO date string for time sensitivity
  effort?: Effort;        // Task effort estimate
  // V4.0: Work duration tracking
  startedAt?: string;     // ISO timestamp when work actually began (status → in_progress)
}

export interface DataGap {
  id: string;
  element: string;
  coverage: string;
  priority: Priority;
  impact: string;
  effort: Effort;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  date: string;
  decision: string;
  rationale: string;
  createdAt: string;
}

// V3 prep: Context switch tracking
export interface TaskCompletionRecord {
  id: string;
  taskId: string;
  actualCompletionTime: number;  // Hours from creation to done (queue time + work time)
  wasBlocking: boolean;
  userOverrideCount: number;
  contextSwitchCount: number;
  outcome: TaskOutcome;
  completedAt: string;
  // V3 additions
  initialPriorityScore?: number;  // Score when task was created
  finalPriorityScore?: number;    // Score at completion
  // V4.0: Actual work duration tracking
  startedAt?: string;             // When work began (status → in_progress)
  actualWorkTime?: number;        // Hours from startedAt to completedAt (actual work, not queue time)
  // V4: Workspace tracking for ML aggregation
  workspaceId?: string;           // Which workspace this completion came from
}

// V3: Priority change event (for learning from user overrides)
export interface PriorityChangeEvent {
  id: string;
  taskId: string;
  oldPriority: Priority;
  newPriority: Priority;
  oldScore: number;
  newScore: number;
  timestamp: string;
  // Context: what was the queue state when user made this change?
  queuePositionBefore: number;  // Rank in queue before change
  queuePositionAfter: number;   // Rank in queue after change
  // V4: Workspace tracking for ML aggregation
  workspaceId?: string;
}

// V3: Task selection event (for learning user preferences)
// V4.1: Enhanced with skipped task tracking for pairwise learning
export interface TaskSelectionEvent {
  id: string;
  selectedTaskId: string;
  selectedTaskScore: number;
  selectedTaskRank: number;      // Where was it in the queue?
  topTaskId: string;             // What did we recommend?
  topTaskScore: number;
  queueSize: number;             // How many tasks were available?
  wasTopSelected: boolean;       // Did user follow our recommendation?
  timestamp: string;
  // V4: Workspace tracking for ML aggregation
  workspaceId?: string;
  
  // V4.1: Enhanced learning signals for skipped tasks
  // Captures ALL tasks ranked higher than selected (not just top task)
  skippedTaskIds?: string[];     // IDs of tasks user skipped to select this one
  
  // V4.1: Pairwise preferences (the ML gold!)
  // If user selects task at rank 5, generates:
  //   selected > task_at_rank_0, selected > task_at_rank_1, ..., selected > task_at_rank_4
  implicitPreferences?: Array<{
    preferredTaskId: string;     // The task user selected (should rank higher)
    skippedTaskId: string;       // Task that was ranked higher but ignored
    scoreDiff: number;           // selected_score - skipped_score (positive = heuristics got it wrong)
  }>;
  
  // V4.1: Feature snapshot of selected task (for offline retraining)
  selectedTaskFeatures?: {
    priority: Priority;
    priorityScore: number;
    weights: TaskWeights;
    effort?: Effort;
    hasDeadline: boolean;
    hasBlocking: boolean;
    hasDependencies: boolean;
  };
}

// V3: Queue rebalance event (for learning queue dynamics)
export interface QueueRebalanceEvent {
  id: string;
  trigger: 'task_created' | 'task_completed' | 'task_deleted' | 'task_updated' | 'weights_changed';
  triggerTaskId?: string;        // Which task triggered the rebalance
  timestamp: string;
  // Snapshot of queue state before/after
  queueSizeBefore: number;
  queueSizeAfter: number;
  // Track which tasks changed position significantly (>2 ranks)
  significantChanges: Array<{
    taskId: string;
    rankBefore: number;
    rankAfter: number;
    scoreBefore: number;
    scoreAfter: number;
  }>;
  // Top 3 tasks before/after for quick comparison
  topTasksBefore: string[];
  topTasksAfter: string[];
  // V4: Workspace tracking for ML aggregation
  workspaceId?: string;
}

// V3.2: Drag reorder event (for online learning from UI interactions)
export interface DragReorderEvent {
  id: string;
  taskId: string;                // The task being dragged
  fromRank: number;              // Original position (0-indexed)
  toRank: number;                // New position after drop
  direction: 'promoted' | 'demoted';
  timestamp: string;
  
  // Pairwise preferences generated (the ML gold!)
  // If task A dragged from rank 5 to rank 2, generates:
  //   A > task_at_rank_2, A > task_at_rank_3, A > task_at_rank_4
  implicitPreferences: Array<{
    preferredTaskId: string;     // Task that should rank higher
    demotedTaskId: string;       // Task that should rank lower
    scoreDiff: number;           // current_score(preferred) - current_score(demoted)
                                 // Negative means heuristics got it wrong
  }>;
  
  // Snapshot of task features at drag time (for offline retraining)
  draggedTaskFeatures: {
    priority: Priority;
    priorityScore: number;
    weights: TaskWeights;
    effort?: Effort;
    hasDeadline: boolean;
    hasBlocking: boolean;
    hasDependencies: boolean;
  };
  
  // Weight update applied (if online learning is enabled)
  appliedWeightDelta?: Partial<HeuristicWeights>;
  
  // Queue context
  queueSize: number;
  tasksPassedIds: string[];      // IDs of tasks that were leapfrogged
  // V4: Workspace tracking for ML aggregation
  workspaceId?: string;
}

// V3.2: Online learner persistent state
export interface OnlineLearnerState {
  enabled: boolean;              // Master switch for online updates
  learningRate: number;          // SGD learning rate (default: 0.01)
  momentum: number;              // Momentum coefficient (default: 0.9)
  totalUpdates: number;          // How many drag events processed
  lastUpdateTimestamp?: string;
  
  // Exponential moving average of gradients (for momentum-based SGD)
  momentumBuffer: HeuristicWeights;
  
  // Safeguards
  maxWeightChange: number;       // Max single-update delta (default: 0.5)
  minWeight: number;             // Floor for any weight (default: 0.1)
  maxWeight: number;             // Ceiling for any weight (default: 50.0)
  
  // Training metrics
  cumulativeLoss: number;        // Sum of pairwise ranking losses
  correctPredictions: number;    // Pairs where heuristics agreed with user
  totalPairs: number;            // Total pairwise comparisons seen
}

export const DEFAULT_ONLINE_LEARNER_STATE: OnlineLearnerState = {
  enabled: true,
  learningRate: 0.01,
  momentum: 0.9,
  totalUpdates: 0,
  momentumBuffer: {
    blocking: 0,
    crossProject: 0,
    timeSensitive: 0,
    effortValue: 0,
    dependency: 0,
  },
  maxWeightChange: 0.5,
  minWeight: 0.1,
  maxWeight: 50.0,
  cumulativeLoss: 0,
  correctPredictions: 0,
  totalPairs: 0,
};

// V4 Prep: Objective/Goal for goal-conditioned learning
export interface Objective {
  id: string;
  name: string;
  description: string;
  targetDate?: string;           // When should this be achieved?
  status: 'active' | 'achieved' | 'abandoned';
  keyResults: Array<{
    id: string;
    metric: string;
    target: number;
    current: number;
    unit?: string;
  }>;
  linkedTaskIds: string[];       // Tasks that contribute to this objective
  linkedProjectIds: string[];    // Projects this objective spans
  createdAt: string;
  updatedAt: string;
}

// V4 Prep: Objective progress snapshot (for trajectory learning)
export interface ObjectiveProgressEvent {
  id: string;
  objectiveId: string;
  timestamp: string;
  progressPercent: number;       // 0-100
  keyResultProgress: Array<{
    keyResultId: string;
    current: number;
    target: number;
  }>;
  tasksCompletedSinceLastSnapshot: string[];
  // Context: what was queue state when progress was made?
  queueSnapshot: Array<{
    taskId: string;
    rank: number;
    score: number;
  }>;
}

// V2/V3/V4 Database schema (per-workspace data)
export interface ProgressDatabase {
  version: 'v1' | 'v2' | 'v3' | 'v3.2' | 'v4';
  lastUpdated: string;
  projects: Project[];
  tasks: WeightedTask[];
  dataGaps: DataGap[];
  decisions: Decision[];
  // Legacy: These are now stored in GlobalMLDatabase but kept for migration
  completionRecords: TaskCompletionRecord[];
  heuristicWeights: HeuristicWeights;
  priorityChangeEvents?: PriorityChangeEvent[];
  taskSelectionEvents?: TaskSelectionEvent[];
  queueRebalanceEvents?: QueueRebalanceEvent[];
  dragReorderEvents?: DragReorderEvent[];
  onlineLearnerState?: OnlineLearnerState;
  // V4: Goal-conditioned learning (workspace-scoped)
  objectives?: Objective[];
  objectiveProgressEvents?: ObjectiveProgressEvent[];
}

// V4: Global ML training data (shared across ALL workspaces)
// This ensures training data continuity regardless of workspace switching
export interface GlobalMLDatabase {
  version: 'v1';
  lastUpdated: string;
  // V2: Tunable heuristic weights (global baseline)
  heuristicWeights: HeuristicWeights;
  // V3: ML training data (aggregated from all workspaces)
  completionRecords: TaskCompletionRecord[];
  priorityChangeEvents: PriorityChangeEvent[];
  taskSelectionEvents: TaskSelectionEvent[];
  queueRebalanceEvents: QueueRebalanceEvent[];
  // V3.2: Online learning from drag-and-drop
  dragReorderEvents: DragReorderEvent[];
  onlineLearnerState: OnlineLearnerState;
}

export const DEFAULT_GLOBAL_ML_DATABASE: GlobalMLDatabase = {
  version: 'v1',
  lastUpdated: new Date().toISOString(),
  heuristicWeights: { ...DEFAULT_HEURISTIC_WEIGHTS },
  completionRecords: [],
  priorityChangeEvents: [],
  taskSelectionEvents: [],
  queueRebalanceEvents: [],
  dragReorderEvents: [],
  onlineLearnerState: { ...DEFAULT_ONLINE_LEARNER_STATE },
};

// API response types
export interface UnifiedProgress {
  version: 'v1' | 'v2';
  lastUpdated: string;
  projects: Project[];
  priorityQueue: WeightedTask[];
  dataGaps: DataGap[];
  decisions: Decision[];
  // V2 additions
  topPriority?: WeightedTask;
  heuristicWeights?: HeuristicWeights;
}

// Create/Update DTOs
export interface CreateProjectDTO {
  name: string;
  path: string;
  status?: ProjectStatus;
  primaryFocus: string;
}

export interface UpdateProjectDTO {
  name?: string;
  path?: string;
  status?: ProjectStatus;
  primaryFocus?: string;
}

export interface CreateTaskDTO {
  id?: string;  // Allow custom IDs like DATA-001
  priority: Priority;
  task: string;
  project: string;
  status?: TaskStatus;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
  deadline?: string;
  effort?: Effort;
  // V2: Optional manual weight overrides
  weights?: Partial<TaskWeights>;
}

export interface UpdateTaskDTO {
  priority?: Priority;
  task?: string;
  project?: string;
  status?: TaskStatus;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
  deadline?: string;
  effort?: Effort;
  weights?: Partial<TaskWeights>;
}

export interface CreateDataGapDTO {
  element: string;
  coverage: string;
  priority: Priority;
  impact: string;
  effort: Effort;
}

export interface UpdateDataGapDTO {
  element?: string;
  coverage?: string;
  priority?: Priority;
  impact?: string;
  effort?: Effort;
}

export interface CreateDecisionDTO {
  date: string;
  decision: string;
  rationale: string;
}

export interface LogContextSwitchDTO {
  taskId: string;
}

// V2: Heuristic weight update DTO
export interface UpdateHeuristicWeightsDTO {
  blocking?: number;
  crossProject?: number;
  timeSensitive?: number;
  effortValue?: number;
  dependency?: number;
}

// V3.2: Drag reorder DTO (from frontend)
export interface LogDragReorderDTO {
  taskId: string;
  fromRank: number;
  toRank: number;
}

// V3.2: Online learner config update DTO
export interface UpdateOnlineLearnerDTO {
  enabled?: boolean;
  learningRate?: number;
  momentum?: number;
  maxWeightChange?: number;
  minWeight?: number;
  maxWeight?: number;
}

// V4: Workspace Management
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMetadata {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
}

export interface CreateWorkspaceDTO {
  name: string;
  description?: string;
}
