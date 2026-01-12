/**
 * Memoized Selectors
 * 
 * Following Redux best practices:
 * - Use createSelector for derived data
 * - Input selectors should be simple state accessors
 * - Output selectors compute derived data
 * - Selectors are composable
 */

import { createSelector } from '@reduxjs/toolkit';
import { priorityApi } from './api';
import type { WeightedTask, Project, Decision, HeuristicWeights, Priority, TaskStatus } from '../types';

// ============================================================================
// RTK Query Cache Selectors
// Using the proper RTK Query selector pattern
// ============================================================================

// Get the cached result from RTK Query
const selectStatusResult = priorityApi.endpoints.getStatus.select(undefined);

// Extract data from the query result
export const selectStatusData = createSelector(
  selectStatusResult,
  (result) => result.data
);

export const selectPriorityQueue = createSelector(
  selectStatusData,
  (data): WeightedTask[] => data?.priorityQueue ?? []
);

export const selectProjects = createSelector(
  selectStatusData,
  (data): Project[] => data?.projects ?? []
);

export const selectDecisions = createSelector(
  selectStatusData,
  (data): Decision[] => data?.decisions ?? []
);

export const selectHeuristicWeights = createSelector(
  selectStatusData,
  (data): HeuristicWeights | undefined => data?.heuristicWeights
);

export const selectTopPriority = createSelector(
  selectStatusData,
  (data): WeightedTask | undefined => data?.topPriority ?? undefined
);

// ============================================================================
// UI State Selectors (from RootState)
// ============================================================================

interface RootStateWithUI {
  ui: {
    filterProject: string;
    filterPriority: Priority | 'all';
    filterStatus: TaskStatus | 'all';
    searchQuery: string;
    selectedTaskId: string | null;
    viewMode: string;
    isWeightsPanelOpen: boolean;
    isDetailsPanelOpen: boolean;
  };
}

export const selectFilterProject = (state: RootStateWithUI) => state.ui.filterProject;
export const selectFilterPriority = (state: RootStateWithUI) => state.ui.filterPriority;
export const selectFilterStatus = (state: RootStateWithUI) => state.ui.filterStatus;
export const selectSearchQuery = (state: RootStateWithUI) => state.ui.searchQuery;
export const selectSelectedTaskId = (state: RootStateWithUI) => state.ui.selectedTaskId;

// ============================================================================
// DERIVED SELECTORS (Memoized computations)
// ============================================================================

/**
 * Tasks sorted by priority score (lower = higher priority)
 */
export const selectSortedTasks = createSelector(
  [selectPriorityQueue],
  (tasks): WeightedTask[] => 
    [...tasks].sort((a, b) => a.priorityScore - b.priorityScore)
);

/**
 * Tasks filtered by current UI filters
 */
export const selectFilteredTasks = createSelector(
  [selectSortedTasks, selectFilterProject, selectFilterPriority, selectFilterStatus, selectSearchQuery],
  (tasks, filterProject, filterPriority, filterStatus, searchQuery): WeightedTask[] => {
    return tasks.filter((task: WeightedTask) => {
      // Project filter
      if (filterProject !== 'all' && task.project !== filterProject) return false;
      
      // Priority filter
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      
      // Status filter
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          task.task.toLowerCase().includes(query) ||
          task.id.toLowerCase().includes(query) ||
          task.project.toLowerCase().includes(query) ||
          (task.notes?.toLowerCase().includes(query) ?? false)
        );
      }
      
      return true;
    });
  }
);

/**
 * Tasks grouped by project
 */
export const selectTasksByProject = createSelector(
  [selectSortedTasks, selectProjects],
  (tasks, projects): Record<string, WeightedTask[]> => {
    const byProject: Record<string, WeightedTask[]> = {};
    for (const project of projects) {
      byProject[project.name] = tasks.filter((t: WeightedTask) => t.project === project.name);
    }
    return byProject;
  }
);

/**
 * Tasks grouped by priority level
 */
export const selectTasksByPriority = createSelector(
  [selectSortedTasks],
  (tasks): Record<Priority, WeightedTask[]> => ({
    P0: tasks.filter((t: WeightedTask) => t.priority === 'P0'),
    P1: tasks.filter((t: WeightedTask) => t.priority === 'P1'),
    P2: tasks.filter((t: WeightedTask) => t.priority === 'P2'),
    P3: tasks.filter((t: WeightedTask) => t.priority === 'P3'),
  })
);

/**
 * Tasks grouped by status (for kanban view)
 */
export const selectTasksByStatus = createSelector(
  [selectSortedTasks],
  (tasks): Record<TaskStatus, WeightedTask[]> => ({
    not_started: tasks.filter((t: WeightedTask) => t.status === 'not_started'),
    in_progress: tasks.filter((t: WeightedTask) => t.status === 'in_progress'),
    blocked: tasks.filter((t: WeightedTask) => t.status === 'blocked'),
    waiting: tasks.filter((t: WeightedTask) => t.status === 'waiting'),
    complete: tasks.filter((t: WeightedTask) => t.status === 'complete'),
  })
);

/**
 * Task statistics
 */
export const selectTaskStats = createSelector(
  [selectPriorityQueue],
  (tasks) => ({
    total: tasks.length,
    p0Count: tasks.filter((t: WeightedTask) => t.priority === 'P0').length,
    p1Count: tasks.filter((t: WeightedTask) => t.priority === 'P1').length,
    p2Count: tasks.filter((t: WeightedTask) => t.priority === 'P2').length,
    p3Count: tasks.filter((t: WeightedTask) => t.priority === 'P3').length,
    inProgress: tasks.filter((t: WeightedTask) => t.status === 'in_progress').length,
    blocked: tasks.filter((t: WeightedTask) => t.status === 'blocked').length,
    waiting: tasks.filter((t: WeightedTask) => t.status === 'waiting').length,
    complete: tasks.filter((t: WeightedTask) => t.status === 'complete').length,
  })
);

/**
 * Active projects only
 */
export const selectActiveProjects = createSelector(
  [selectProjects],
  (projects): Project[] => projects.filter((p: Project) => p.status === 'active')
);

/**
 * Selected task details
 */
export const selectSelectedTask = createSelector(
  [selectPriorityQueue, selectSelectedTaskId],
  (tasks, selectedId): WeightedTask | null => 
    selectedId ? tasks.find((t: WeightedTask) => t.id === selectedId) ?? null : null
);

/**
 * Project task counts
 */
export const selectProjectTaskCounts = createSelector(
  [selectPriorityQueue, selectProjects],
  (tasks, projects): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const project of projects) {
      counts[project.name] = tasks.filter((t: WeightedTask) => t.project === project.name).length;
    }
    return counts;
  }
);
