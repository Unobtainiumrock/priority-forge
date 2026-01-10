import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatScore(score: number): string {
  const prefix = score >= 0 ? '+' : '';
  return `${prefix}${score.toFixed(0)}`;
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'P0': return 'text-red-400';
    case 'P1': return 'text-amber-400';
    case 'P2': return 'text-blue-400';
    case 'P3': return 'text-gray-400';
    default: return 'text-surface-400';
  }
}

export function getPriorityBgClass(priority: string): string {
  switch (priority) {
    case 'P0': return 'priority-badge-p0';
    case 'P1': return 'priority-badge-p1';
    case 'P2': return 'priority-badge-p2';
    case 'P3': return 'priority-badge-p3';
    default: return 'bg-surface-700';
  }
}

export function getStatusColor(status: string): 'healthy' | 'warning' | 'critical' | 'neutral' {
  switch (status) {
    case 'in_progress': return 'healthy';
    case 'blocked': return 'critical';
    case 'waiting': return 'warning';
    case 'complete': return 'healthy';
    default: return 'neutral';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'not_started': return 'Not Started';
    case 'in_progress': return 'In Progress';
    case 'complete': return 'Complete';
    case 'blocked': return 'Blocked';
    case 'waiting': return 'Waiting';
    default: return status;
  }
}

export function getEffortLabel(effort?: string): string {
  switch (effort) {
    case 'low': return '⚡ Quick';
    case 'medium': return '⏱️ Medium';
    case 'high': return '🏔️ High';
    default: return '';
  }
}

export function scoreToUrgency(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score < 0) return 'critical';
  if (score < 100) return 'high';
  if (score < 200) return 'medium';
  return 'low';
}

