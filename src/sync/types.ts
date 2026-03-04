export type SyncEventType =
  | 'task_created'
  | 'task_selected'
  | 'task_updated'
  | 'task_completed'
  | 'context_switch'
  | 'project_created'
  | 'project_updated';

export interface SyncEvent {
  eventId: string;
  userId: string;
  workspaceId: string;
  timestamp: string;
  version: string;
  eventType: SyncEventType;
  data: Record<string, unknown>;
  private: boolean;
  visibility: 'team' | 'private';
}

export interface TeamPulseConfig {
  enabled: boolean;
  hubUrl: string;
  userId: string;
  apiKey: string;
  syncInterval: number;
  pushImmediately: SyncEventType[];
  privacyRules: {
    defaultVisibility: 'team' | 'private';
    privateProjects: string[];
    privateTasks: string[];
  };
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  offline: {
    queueEnabled: boolean;
    maxQueueSize: number;
  };
}

export const DEFAULT_TEAM_PULSE_CONFIG: TeamPulseConfig = {
  enabled: false,
  hubUrl: '',
  userId: '',
  apiKey: '',
  syncInterval: 60000,
  pushImmediately: ['task_selected', 'task_completed'],
  privacyRules: {
    defaultVisibility: 'team',
    privateProjects: [],
    privateTasks: [],
  },
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000,
  },
  offline: {
    queueEnabled: true,
    maxQueueSize: 1000,
  },
};
