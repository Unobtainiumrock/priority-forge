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

/**
 * V2 Priority Scoring Logic
 * 
 * Calculates priority scores based on weighted heuristics.
 * Lower scores = higher priority (for min-heap extraction)
 */

import {
  WeightedTask,
  Task,
  TaskWeights,
  HeuristicWeights,
  DEFAULT_HEURISTIC_WEIGHTS,
  Priority,
  Effort,
} from '../types/schema';

// Base priority score from P0-P3 labels (provides initial ordering)
const PRIORITY_BASE_SCORES: Record<Priority, number> = {
  P0: 0,    // Critical
  P1: 100,  // High
  P2: 200,  // Medium
  P3: 300,  // Low
};

// Effort to numeric mapping
const EFFORT_VALUES: Record<Effort, number> = {
  low: 3,    // Quick wins
  medium: 2,
  high: 1,   // Long slogs
};

/**
 * Calculate task weights based on task properties and dependencies
 */
export function calculateTaskWeights(
  task: Task,
  allTasks: Task[],
  manualOverrides?: Partial<TaskWeights>
): TaskWeights {
  // Count how many tasks depend on this one (blocking count)
  const blockingCount = allTasks.filter(t => 
    t.dependencies?.includes(task.id) || t.blocking === task.id
  ).length;

  // Check if task affects multiple projects
  const projectsAffected = new Set<string>();
  projectsAffected.add(task.project);
  
  // If this task blocks others, check their projects
  for (const t of allTasks) {
    if (t.dependencies?.includes(task.id) || t.blocking === task.id) {
      projectsAffected.add(t.project);
    }
  }
  const crossProjectImpact = projectsAffected.size > 1 ? 1 : 0;

  // Time sensitivity based on deadline (if present)
  let timeSensitivity = 0;
  if ((task as WeightedTask).deadline) {
    const deadline = new Date((task as WeightedTask).deadline!);
    const now = new Date();
    const daysUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysUntilDeadline < 0) {
      timeSensitivity = 10; // Overdue
    } else if (daysUntilDeadline < 1) {
      timeSensitivity = 9;  // Due today
    } else if (daysUntilDeadline < 3) {
      timeSensitivity = 7;  // Due soon
    } else if (daysUntilDeadline < 7) {
      timeSensitivity = 5;  // Due this week
    } else if (daysUntilDeadline < 14) {
      timeSensitivity = 3;  // Due in 2 weeks
    } else {
      timeSensitivity = 1;  // Not urgent
    }
  } else if (task.blocking) {
    // Tasks that block others are implicitly time-sensitive
    timeSensitivity = 4;
  }

  // Effort/value ratio - quick wins get higher scores
  const effort = (task as WeightedTask).effort || 'medium';
  const effortValueRatio = EFFORT_VALUES[effort] * 3; // Scale to 0-9 range

  // Dependency depth - how many levels of dependencies
  const dependencyDepth = calculateDependencyDepth(task, allTasks, new Set());

  const weights: TaskWeights = {
    blockingCount: Math.min(blockingCount, 10),
    crossProjectImpact,
    timeSensitivity,
    effortValueRatio,
    dependencyDepth: Math.min(dependencyDepth, 5),
  };

  // Apply manual overrides (only non-null values)
  if (manualOverrides) {
    const filteredOverrides: Partial<TaskWeights> = {};
    for (const [key, value] of Object.entries(manualOverrides)) {
      if (value !== null && value !== undefined) {
        filteredOverrides[key as keyof TaskWeights] = value;
      }
    }
    return { ...weights, ...filteredOverrides };
  }

  return weights;
}

/**
 * Calculate how deep in the dependency chain a task is
 */
function calculateDependencyDepth(
  task: Task,
  allTasks: Task[],
  visited: Set<string>
): number {
  if (!task.dependencies || task.dependencies.length === 0) {
    return 0;
  }

  if (visited.has(task.id)) {
    return 0; // Prevent cycles
  }
  visited.add(task.id);

  let maxDepth = 0;
  for (const depId of task.dependencies) {
    const depTask = allTasks.find(t => t.id === depId);
    if (depTask) {
      const depth = 1 + calculateDependencyDepth(depTask, allTasks, visited);
      maxDepth = Math.max(maxDepth, depth);
    }
  }

  return maxDepth;
}

/**
 * Calculate the final priority score for a task
 * Lower score = higher priority
 */
export function calculatePriorityScore(
  weights: TaskWeights,
  basePriority: Priority,
  heuristicWeights: HeuristicWeights = DEFAULT_HEURISTIC_WEIGHTS
): number {
  // Start with base score from P0-P3 label
  const baseScore = PRIORITY_BASE_SCORES[basePriority];

  // Calculate weighted adjustment (negative = more urgent)
  // We invert some factors since lower scores mean higher priority
  const weightedAdjustment = -(
    heuristicWeights.blocking * weights.blockingCount +
    heuristicWeights.crossProject * weights.crossProjectImpact +
    heuristicWeights.timeSensitive * weights.timeSensitivity +
    heuristicWeights.effortValue * weights.effortValueRatio +
    heuristicWeights.dependency * weights.dependencyDepth
  );

  // Final score: base + adjustment
  // A P0 task with high blocking count will have lower score than P0 with no blocking
  return baseScore + weightedAdjustment;
}

/**
 * Convert a basic Task to a WeightedTask with computed scores
 */
export function toWeightedTask(
  task: Task | WeightedTask,
  allTasks: Task[],
  heuristicWeights: HeuristicWeights = DEFAULT_HEURISTIC_WEIGHTS
): WeightedTask {
  // Check if already weighted
  const existingWeights = (task as WeightedTask).weights;
  
  const weights = calculateTaskWeights(task, allTasks, existingWeights);
  const priorityScore = calculatePriorityScore(weights, task.priority, heuristicWeights);

  return {
    ...task,
    priorityScore,
    weights,
    deadline: (task as WeightedTask).deadline,
    effort: (task as WeightedTask).effort,
  };
}

/**
 * Recalculate all task scores (for bulk updates or weight changes)
 */
export function recalculateAllScores(
  tasks: (Task | WeightedTask)[],
  heuristicWeights: HeuristicWeights = DEFAULT_HEURISTIC_WEIGHTS
): WeightedTask[] {
  // First pass: calculate weights for all tasks
  const baseTasks = tasks as Task[];
  
  // Second pass: convert to weighted tasks with scores
  return tasks.map(task => toWeightedTask(task, baseTasks, heuristicWeights));
}

/**
 * Get default weights for a new task
 */
export function getDefaultWeights(): TaskWeights {
  return {
    blockingCount: 0,
    crossProjectImpact: 0,
    timeSensitivity: 0,
    effortValueRatio: 6,  // Default medium effort
    dependencyDepth: 0,
  };
}

