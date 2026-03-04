import * as fs from 'fs';
import * as path from 'path';
import { TeamPulseConfig, DEFAULT_TEAM_PULSE_CONFIG } from './types';

const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.priority-forge',
);
const CONFIG_FILE = path.join(CONFIG_DIR, 'team-pulse.json');

export function loadTeamPulseConfig(): TeamPulseConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TeamPulseConfig>;
      return { ...DEFAULT_TEAM_PULSE_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error('[TeamPulse] Failed to load config:', error);
  }
  return { ...DEFAULT_TEAM_PULSE_CONFIG };
}

export function saveTeamPulseConfig(config: TeamPulseConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function updateTeamPulseConfig(
  updates: Partial<TeamPulseConfig>,
): TeamPulseConfig {
  const current = loadTeamPulseConfig();
  const merged = {
    ...current,
    ...updates,
    privacyRules: {
      ...current.privacyRules,
      ...(updates.privacyRules || {}),
    },
    retryPolicy: {
      ...current.retryPolicy,
      ...(updates.retryPolicy || {}),
    },
    offline: {
      ...current.offline,
      ...(updates.offline || {}),
    },
  };
  saveTeamPulseConfig(merged);
  return merged;
}
