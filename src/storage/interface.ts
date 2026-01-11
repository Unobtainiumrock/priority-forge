import {
  Project,
  WeightedTask,
  DataGap,
  Decision,
  TaskCompletionRecord,
  PriorityChangeEvent,
  TaskSelectionEvent,
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
  UpdateHeuristicWeightsDTO,
} from '../types/schema';

export interface StorageInterface {
  // Database
  getAll(): Promise<ProgressDatabase>;
  
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(data: CreateProjectDTO): Promise<Project>;
  updateProject(id: string, data: UpdateProjectDTO): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  
  // Tasks - V2 with heap-based ordering
  getTasks(includeCompleted?: boolean): Promise<WeightedTask[]>;
  getAllTasks(): Promise<WeightedTask[]>;
  getCompletedTasks(): Promise<WeightedTask[]>;
  getTask(id: string): Promise<WeightedTask | null>;
  getTasksByPriority(priority: Priority): Promise<WeightedTask[]>;
  getTasksByProject(projectId: string): Promise<WeightedTask[]>;
  createTask(data: CreateTaskDTO): Promise<WeightedTask>;
  updateTask(id: string, data: UpdateTaskDTO): Promise<WeightedTask | null>;
  deleteTask(id: string): Promise<boolean>;
  
  // V2: Heap operations
  getTopPriority(): Promise<WeightedTask | null>;
  popTopPriority(): Promise<WeightedTask | null>;
  recalculateAllPriorities(): Promise<WeightedTask[]>;
  
  // V2: Heuristic weight management
  getHeuristicWeights(): Promise<HeuristicWeights>;
  updateHeuristicWeights(weights: UpdateHeuristicWeightsDTO): Promise<HeuristicWeights>;
  
  // Data Gaps
  getDataGaps(): Promise<DataGap[]>;
  getDataGap(id: string): Promise<DataGap | null>;
  createDataGap(data: CreateDataGapDTO): Promise<DataGap>;
  updateDataGap(id: string, data: UpdateDataGapDTO): Promise<DataGap | null>;
  deleteDataGap(id: string): Promise<boolean>;
  
  // Decisions
  getDecisions(): Promise<Decision[]>;
  createDecision(data: CreateDecisionDTO): Promise<Decision>;
  
  // V3 Prep: Completion Records
  logContextSwitch(taskId: string): Promise<void>;
  completeTask(taskId: string, outcome: 'completed' | 'cancelled' | 'deferred'): Promise<TaskCompletionRecord | null>;
  getCompletionRecords(): Promise<TaskCompletionRecord[]>;
  
  // V3: ML Training Data
  logTaskSelection(selectedTaskId: string): Promise<TaskSelectionEvent | null>;
  getPriorityChangeEvents(): Promise<PriorityChangeEvent[]>;
  getTaskSelectionEvents(): Promise<TaskSelectionEvent[]>;
  exportTrainingData(): Promise<{
    completionRecords: TaskCompletionRecord[];
    priorityChangeEvents: PriorityChangeEvent[];
    taskSelectionEvents: TaskSelectionEvent[];
    tasks: WeightedTask[];
    heuristicWeights: HeuristicWeights;
    summary: {
      totalCompletions: number;
      totalPriorityChanges: number;
      totalSelections: number;
      selectionAccuracy: number;
    };
  }>;
}
