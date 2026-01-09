// V1 Schema with V2/V3 prep fields

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

export interface Task {
  id: string;
  priority: Priority;
  task: string;
  project: string;
  status: TaskStatus;
  blocking?: string;
  dependencies?: string[];  // V2 prep: Task IDs this depends on
  notes?: string;
  createdAt: string;
  updatedAt: string;
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

// Full database schema
export interface ProgressDatabase {
  version: 'v1';
  lastUpdated: string;
  projects: Project[];
  tasks: Task[];
  dataGaps: DataGap[];
  decisions: Decision[];
  completionRecords: TaskCompletionRecord[];  // V3 prep
}

// API response types
export interface UnifiedProgress {
  version: 'v1';
  lastUpdated: string;
  projects: Project[];
  priorityQueue: Task[];
  dataGaps: DataGap[];
  decisions: Decision[];
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
  priority: Priority;
  task: string;
  project: string;
  status?: TaskStatus;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
}

export interface UpdateTaskDTO {
  priority?: Priority;
  task?: string;
  project?: string;
  status?: TaskStatus;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
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
