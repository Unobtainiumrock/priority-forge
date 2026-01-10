import { useAppSelector } from '../store/hooks';
import { selectTaskStats, selectTopPriority } from '../store/selectors';
import { cn } from '../lib/utils';
import { 
  Target, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Hourglass 
} from 'lucide-react';

export function StatsBar() {
  const stats = useAppSelector(selectTaskStats);
  const topPriority = useAppSelector(selectTopPriority);

  const items = [
    { 
      label: 'P0 Critical', 
      value: stats.p0Count, 
      icon: AlertCircle,
      color: stats.p0Count > 0 ? 'text-red-400' : 'text-surface-400',
      bg: stats.p0Count > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-800/50 border-surface-700',
      glow: stats.p0Count > 0,
    },
    { 
      label: 'In Progress', 
      value: stats.inProgress, 
      icon: Clock,
      color: stats.inProgress > 0 ? 'text-green-400' : 'text-surface-400',
      bg: stats.inProgress > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-surface-800/50 border-surface-700',
    },
    { 
      label: 'Blocked', 
      value: stats.blocked, 
      icon: AlertCircle,
      color: stats.blocked > 0 ? 'text-red-400' : 'text-surface-400',
      bg: stats.blocked > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-800/50 border-surface-700',
      pulse: stats.blocked > 0,
    },
    { 
      label: 'Waiting', 
      value: stats.waiting, 
      icon: Hourglass,
      color: stats.waiting > 0 ? 'text-amber-400' : 'text-surface-400',
      bg: stats.waiting > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface-800/50 border-surface-700',
    },
    { 
      label: 'Complete', 
      value: stats.complete, 
      icon: CheckCircle2,
      color: stats.complete > 0 ? 'text-blue-400' : 'text-surface-400',
      bg: stats.complete > 0 ? 'bg-blue-500/10 border-blue-500/30' : 'bg-surface-800/50 border-surface-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              'p-4 rounded-xl border transition-all animate-slide-up',
              item.bg,
              item.pulse && 'animate-pulse',
            )}
            style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-4 h-4', item.color)} />
              <span className="text-xs text-surface-500 uppercase tracking-wide">
                {item.label}
              </span>
            </div>
            <span className={cn('text-2xl font-bold font-display', item.color)}>
              {item.value}
            </span>
          </div>
        );
      })}

      {/* Top Priority Card */}
      {topPriority && (
        <div className="col-span-2 md:col-span-5 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-accent-500/10 border border-green-500/30 animate-slide-up stagger-5" style={{ animationFillMode: 'forwards' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Target className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <span className="text-xs text-surface-500 uppercase tracking-wide block">
                Top Priority
              </span>
              <span className="text-sm font-medium text-surface-100">
                [{topPriority.id}] {topPriority.task}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-surface-500 block">Score</span>
              <span className="text-lg font-mono font-bold text-green-400">
                {topPriority.priorityScore > 0 ? '+' : ''}{topPriority.priorityScore.toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
