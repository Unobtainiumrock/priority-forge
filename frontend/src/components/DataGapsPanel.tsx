import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useAppSelector } from '../store/hooks';
import { selectDataGaps } from '../store/selectors';
import { cn, getPriorityBgClass, getEffortLabel } from '../lib/utils';

export function DataGapsPanel() {
  const dataGaps = useAppSelector(selectDataGaps);

  if (dataGaps.length === 0) {
    return (
      <div className="bg-surface-800/30 rounded-xl border border-surface-700 p-4">
        <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Data Gaps
        </h3>
        <p className="text-sm text-surface-500 text-center py-4">
          No data gaps identified
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-800/30 rounded-xl border border-surface-700 p-4">
      <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        Data Gaps
        <span className="ml-auto px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs">
          {dataGaps.length}
        </span>
      </h3>

      <div className="space-y-3">
        {dataGaps.map((gap: typeof dataGaps[number], index: number) => (
          <div
            key={gap.id}
            className={cn(
              'p-3 rounded-lg bg-surface-800/50 border border-surface-700',
              'animate-slide-up',
              gap.priority === 'P0' && 'border-l-2 border-l-red-500'
            )}
            style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-surface-200">
                {gap.element}
              </span>
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0',
                getPriorityBgClass(gap.priority)
              )}>
                {gap.priority}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-surface-500 mb-2">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Coverage: {gap.coverage}
              </span>
              <span>{getEffortLabel(gap.effort)}</span>
            </div>

            <p className="text-xs text-surface-400 leading-relaxed">
              {gap.impact}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
