import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamPulseSyncEmitter } from '../event-emitter';
import { TeamPulseSyncClient } from '../sync-client';
import { SyncEvent, TeamPulseConfig, DEFAULT_TEAM_PULSE_CONFIG } from '../types';

const enabledConfig: TeamPulseConfig = {
  ...DEFAULT_TEAM_PULSE_CONFIG,
  enabled: true,
  hubUrl: 'http://localhost:3100',
  userId: 'leo',
  apiKey: 'leo-key-123',
};

describe('TeamPulseSyncEmitter', () => {
  it('emits task_selected events when enabled', () => {
    const emitter = new TeamPulseSyncEmitter(enabledConfig, 'workspace-1');
    let emitted: SyncEvent | null = null;
    emitter.on('sync_event', (event: SyncEvent) => {
      emitted = event;
    });

    emitter.emitTaskSelected({
      id: 'TASK-001',
      task: 'Fix auth bug',
      project: 'api',
      priority: 'P0',
      status: 'in_progress',
      startedAt: '2026-02-18T10:00:00Z',
    });

    expect(emitted).not.toBeNull();
    expect(emitted!.eventType).toBe('task_selected');
    expect(emitted!.data.taskId).toBe('TASK-001');
    expect(emitted!.data.task).toBe('Fix auth bug');
    expect(emitted!.userId).toBe('leo');
    expect(emitted!.visibility).toBe('team');
  });

  it('does not emit when disabled', () => {
    const disabledConfig = { ...enabledConfig, enabled: false };
    const emitter = new TeamPulseSyncEmitter(disabledConfig, 'workspace-1');
    let emitted = false;
    emitter.on('sync_event', () => {
      emitted = true;
    });

    emitter.emitTaskSelected({ id: 'TASK-001', task: 'Fix bug', project: 'api' });
    expect(emitted).toBe(false);
  });

  it('respects private project rules', () => {
    const configWithPrivacy: TeamPulseConfig = {
      ...enabledConfig,
      privacyRules: {
        ...enabledConfig.privacyRules,
        privateProjects: ['secret-project'],
      },
    };
    const emitter = new TeamPulseSyncEmitter(configWithPrivacy, 'workspace-1');
    let emitted = false;
    emitter.on('sync_event', () => {
      emitted = true;
    });

    emitter.emitTaskSelected({
      id: 'TASK-002',
      task: 'Secret work',
      project: 'secret-project',
    });
    expect(emitted).toBe(false);
  });

  it('respects private task rules', () => {
    const configWithPrivacy: TeamPulseConfig = {
      ...enabledConfig,
      privacyRules: {
        ...enabledConfig.privacyRules,
        privateTasks: ['TASK-SECRET'],
      },
    };
    const emitter = new TeamPulseSyncEmitter(configWithPrivacy, 'workspace-1');
    let emitted = false;
    emitter.on('sync_event', () => {
      emitted = true;
    });

    emitter.emitTaskSelected({
      id: 'TASK-SECRET',
      task: 'Secret task',
      project: 'api',
    });
    expect(emitted).toBe(false);
  });

  it('emits task_completed events', () => {
    const emitter = new TeamPulseSyncEmitter(enabledConfig, 'workspace-1');
    let emitted: SyncEvent | null = null;
    emitter.on('sync_event', (event: SyncEvent) => {
      emitted = event;
    });

    emitter.emitTaskCompleted(
      { id: 'TASK-001', task: 'Fix auth bug', project: 'api', priority: 'P0' },
      'completed',
    );

    expect(emitted).not.toBeNull();
    expect(emitted!.eventType).toBe('task_completed');
    expect(emitted!.data.outcome).toBe('completed');
  });

  it('emits context_switch events', () => {
    const emitter = new TeamPulseSyncEmitter(enabledConfig, 'workspace-1');
    let emitted: SyncEvent | null = null;
    emitter.on('sync_event', (event: SyncEvent) => {
      emitted = event;
    });

    emitter.emitContextSwitch('TASK-001', 'Fix auth bug', 'api');

    expect(emitted).not.toBeNull();
    expect(emitted!.eventType).toBe('context_switch');
    expect(emitted!.data.fromTaskId).toBe('TASK-001');
  });
});

describe('TeamPulseSyncClient', () => {
  it('queues events', async () => {
    const noPushConfig: TeamPulseConfig = {
      ...enabledConfig,
      pushImmediately: [],
    };
    const client = new TeamPulseSyncClient(noPushConfig);
    const event: SyncEvent = {
      eventId: 'test-1',
      userId: 'leo',
      workspaceId: 'default',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      eventType: 'task_updated',
      data: { taskId: 'TASK-001', task: 'Test' },
      private: false,
      visibility: 'team',
    };

    await client.queueEvent(event);
    const status = client.getStatus();
    expect(status.queuedEvents).toBe(1);
    expect(status.enabled).toBe(true);
  });

  it('respects max queue size', async () => {
    const smallQueueConfig: TeamPulseConfig = {
      ...enabledConfig,
      offline: { queueEnabled: true, maxQueueSize: 3 },
    };
    const client = new TeamPulseSyncClient(smallQueueConfig);

    for (let i = 0; i < 5; i++) {
      await client.queueEvent({
        eventId: `test-${i}`,
        userId: 'leo',
        workspaceId: 'default',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        eventType: 'task_updated',
        data: {},
        private: false,
        visibility: 'team',
      });
    }

    const status = client.getStatus();
    expect(status.queuedEvents).toBeLessThanOrEqual(3);
  });

  it('reports disabled status when not enabled', () => {
    const disabledConfig = { ...enabledConfig, enabled: false };
    const client = new TeamPulseSyncClient(disabledConfig);
    const status = client.getStatus();
    expect(status.enabled).toBe(false);
  });
});
