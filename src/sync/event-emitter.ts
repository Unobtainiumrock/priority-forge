import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SyncEvent, SyncEventType, TeamPulseConfig } from './types';

export class TeamPulseSyncEmitter extends EventEmitter {
  private config: TeamPulseConfig;
  private workspaceId: string;

  constructor(config: TeamPulseConfig, workspaceId: string) {
    super();
    this.config = config;
    this.workspaceId = workspaceId;
  }

  updateConfig(config: TeamPulseConfig): void {
    this.config = config;
  }

  updateWorkspaceId(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  emitTaskCreated(task: Record<string, unknown>): void {
    this.emitIfAllowed('task_created', task.project as string, task.id as string, {
      taskId: task.id,
      task: task.task,
      project: task.project,
      priority: task.priority,
      status: task.status,
      effort: task.effort,
      blocking: task.blocking,
      dependencies: task.dependencies,
    });
  }

  emitTaskSelected(task: Record<string, unknown>): void {
    this.emitIfAllowed('task_selected', task.project as string, task.id as string, {
      taskId: task.id,
      task: task.task,
      project: task.project,
      priority: task.priority,
      status: 'in_progress',
      startedAt: task.startedAt || new Date().toISOString(),
      effort: task.effort,
      blocking: task.blocking,
      dependencies: task.dependencies,
    });
  }

  emitTaskCompleted(
    task: Record<string, unknown>,
    outcome: string,
  ): void {
    this.emitIfAllowed('task_completed', task.project as string, task.id as string, {
      taskId: task.id,
      task: task.task,
      project: task.project,
      priority: task.priority,
      outcome,
      completedAt: new Date().toISOString(),
      startedAt: task.startedAt,
      actualWorkTime: task.actualWorkTime,
    });
  }

  emitTaskUpdated(
    taskId: string,
    changes: Record<string, unknown>,
    previous: Record<string, unknown>,
  ): void {
    const project = (changes.project as string) || (previous.project as string);
    this.emitIfAllowed('task_updated', project, taskId, {
      taskId,
      changes,
      previousValues: previous,
    });
  }

  emitContextSwitch(
    fromTaskId: string,
    fromTask: string,
    fromProject: string,
  ): void {
    this.emitIfAllowed('context_switch', fromProject, fromTaskId, {
      fromTaskId,
      fromTask,
      fromProject,
    });
  }

  emitProjectCreated(project: Record<string, unknown>): void {
    this.emitIfAllowed('project_created', project.name as string, undefined, {
      projectId: project.id,
      name: project.name,
      path: project.path,
      primaryFocus: project.primaryFocus,
      status: project.status,
    });
  }

  private emitIfAllowed(
    eventType: SyncEventType,
    project: string | undefined,
    taskId: string | undefined,
    data: Record<string, unknown>,
  ): void {
    if (!this.config.enabled) return;

    if (project && this.config.privacyRules.privateProjects.includes(project)) {
      return;
    }
    if (taskId && this.config.privacyRules.privateTasks.includes(taskId)) {
      return;
    }

    const isPrivate =
      (project && this.config.privacyRules.privateProjects.includes(project)) ||
      (taskId && this.config.privacyRules.privateTasks.includes(taskId));

    const event: SyncEvent = {
      eventId: uuidv4(),
      userId: this.config.userId,
      workspaceId: this.workspaceId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      eventType,
      data,
      private: !!isPrivate,
      visibility: isPrivate ? 'private' : this.config.privacyRules.defaultVisibility,
    };

    this.emit('sync_event', event);
  }
}
