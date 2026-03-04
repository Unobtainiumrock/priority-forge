import { SyncEvent, TeamPulseConfig } from './types';

export class TeamPulseSyncClient {
  private config: TeamPulseConfig;
  private queue: SyncEvent[] = [];
  private syncTimer?: ReturnType<typeof setInterval>;
  private syncing = false;

  constructor(config: TeamPulseConfig) {
    this.config = config;
  }

  updateConfig(config: TeamPulseConfig): void {
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled || !this.config.hubUrl) return;

    this.syncTimer = setInterval(() => {
      this.flush();
    }, this.config.syncInterval);

    console.log(`[TeamPulse] Sync started → ${this.config.hubUrl}`);
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    console.log('[TeamPulse] Sync stopped');
  }

  async queueEvent(event: SyncEvent): Promise<void> {
    this.queue.push(event);

    if (this.config.offline.maxQueueSize && this.queue.length > this.config.offline.maxQueueSize) {
      this.queue = this.queue.slice(-this.config.offline.maxQueueSize);
    }

    if (this.config.pushImmediately.includes(event.eventType)) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.syncing) return;
    this.syncing = true;

    const batch = [...this.queue];

    try {
      const response = await fetch(`${this.config.hubUrl}/api/sync/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        received: string[];
        rejected: string[];
      };

      const receivedSet = new Set(result.received);
      this.queue = this.queue.filter((e) => !receivedSet.has(e.eventId));

      if (result.received.length > 0) {
        console.log(`[TeamPulse] Synced ${result.received.length} events`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[TeamPulse] Sync failed: ${msg}`);
      await this.retryWithBackoff(batch);
    } finally {
      this.syncing = false;
    }
  }

  private async retryWithBackoff(events: SyncEvent[]): Promise<void> {
    for (let attempt = 1; attempt <= this.config.retryPolicy.maxRetries; attempt++) {
      const backoff = this.config.retryPolicy.backoffMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoff));

      try {
        const response = await fetch(`${this.config.hubUrl}/api/sync/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({ events }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = (await response.json()) as { received: string[] };
          const receivedSet = new Set(result.received);
          this.queue = this.queue.filter((e) => !receivedSet.has(e.eventId));
          console.log(`[TeamPulse] Retry ${attempt} succeeded`);
          return;
        }
      } catch {
        if (attempt === this.config.retryPolicy.maxRetries) {
          console.error('[TeamPulse] All retries exhausted, events remain queued');
        }
      }
    }
  }

  getStatus(): {
    enabled: boolean;
    connected: boolean;
    queuedEvents: number;
    hubUrl: string;
  } {
    return {
      enabled: this.config.enabled,
      connected: this.config.enabled && !!this.config.hubUrl,
      queuedEvents: this.queue.length,
      hubUrl: this.config.hubUrl,
    };
  }
}
