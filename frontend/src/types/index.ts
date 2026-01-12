// Types synchronized with backend schema

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type ProjectStatus = 'active' | 'complete' | 'blocked' | 'shelved';
export type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'waiting';
export type Effort = 'low' | 'medium' | 'high';

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  primaryFocus: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWeights {
  blockingCount: number;
  crossProjectImpact: number;
  timeSensitivity: number;
  effortValueRatio: number;
  dependencyDepth: number;
}

export interface HeuristicWeights {
  blocking: number;
  crossProject: number;
  timeSensitive: number;
  effortValue: number;
  dependency: number;
}

export interface WeightedTask {
  id: string;
  priority: Priority;
  task: string;
  project: string;
  status: TaskStatus;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  priorityScore: number;
  weights: TaskWeights;
  deadline?: string;
  effort?: Effort;
}

export interface Decision {
  id: string;
  date: string;
  decision: string;
  rationale: string;
  createdAt: string;
}

// API Response types
export interface UnifiedProgress {
  version: 'v1' | 'v2';
  lastUpdated: string;
  projects: Project[];
  priorityQueue: WeightedTask[];
  decisions: Decision[];
  topPriority?: WeightedTask;
  heuristicWeights?: HeuristicWeights;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

// UI State types
export type ViewMode = 'list' | 'heap' | 'kanban';
export type FilterProject = string | 'all';
export type FilterPriority = Priority | 'all';
export type FilterStatus = TaskStatus | 'all';

