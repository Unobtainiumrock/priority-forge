import {
  Project,
  Task,
  DataGap,
  Decision,
  TaskCompletionRecord,
  ProgressDatabase,
  CreateProjectDTO,
  UpdateProjectDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
  CreateDataGapDTO,
  UpdateDataGapDTO,
  CreateDecisionDTO,
  Priority,
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
  
  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  getTasksByPriority(priority: Priority): Promise<Task[]>;
  getTasksByProject(projectId: string): Promise<Task[]>;
  createTask(data: CreateTaskDTO): Promise<Task>;
  updateTask(id: string, data: UpdateTaskDTO): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  
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
}
