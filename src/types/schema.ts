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
  actualCompletionTime: number;  // Hours from creation to done
  wasBlocking: boolean;
  userOverrideCount: number;
  contextSwitchCount: number;
  outcome: TaskOutcome;
  completedAt: string;
}

// V2 Database schema
export interface ProgressDatabase {
  version: 'v1' | 'v2';
  lastUpdated: string;
  projects: Project[];
  tasks: WeightedTask[];
  dataGaps: DataGap[];
  decisions: Decision[];
  completionRecords: TaskCompletionRecord[];
  // V2: Tunable heuristic weights
  heuristicWeights: HeuristicWeights;
}

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
