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

import {
  Project,
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
  UpdateHeuristicWeightsDTO,
  LogDragReorderDTO,
  UpdateOnlineLearnerDTO,
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
  getQueueRebalanceEvents(): Promise<QueueRebalanceEvent[]>;
  exportTrainingData(): Promise<{
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
    mlReady: {
      completions: Array<{
        taskId: string;
        completionTimeHours: number;
        wasBlocking: number;
        outcome: string;
        initialScore: number;
        finalScore: number;
        scoreDelta: number;
      }>;
      tasks: Array<{
        id: string;
        priority: number;
        priorityScore: number;
        effort: number;
        blockingCount: number;
        crossProjectImpact: number;
        timeSensitivity: number;
        effortValueRatio: number;
        dependencyDepth: number;
        hasDependencies: number;
        hasBlocking: number;
      }>;
      rebalances: Array<{
        trigger: string;
        queueSizeBefore: number;
        queueSizeAfter: number;
        significantChangeCount: number;
        topTaskChanged: number;
      }>;
    };
  }>;

  // V3.2: Online Learning from Drag-and-Drop
  logDragReorder(dto: LogDragReorderDTO): Promise<DragReorderEvent>;
  getDragReorderEvents(): Promise<DragReorderEvent[]>;
  getOnlineLearnerState(): Promise<OnlineLearnerState>;
  updateOnlineLearnerConfig(config: UpdateOnlineLearnerDTO): Promise<OnlineLearnerState>;
  getOnlineLearnerMetrics(): Promise<{
    totalUpdates: number;
    totalPairs: number;
    correctPredictions: number;
    accuracy: number;
    cumulativeLoss: number;
    currentWeights: HeuristicWeights;
    learningRate: number;
    enabled: boolean;
  }>;
}
