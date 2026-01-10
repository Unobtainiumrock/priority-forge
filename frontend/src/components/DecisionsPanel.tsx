import { BookOpen, Calendar } from 'lucide-react';
import { useAppSelector } from '../store/hooks';
import { selectDecisions } from '../store/selectors';

export function DecisionsPanel() {
  const decisions = useAppSelector(selectDecisions);

  // Sort by date, most recent first
  const sortedDecisions = [...decisions].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (decisions.length === 0) {
    return (
      <div className="bg-surface-800/30 rounded-xl border border-surface-700 p-4">
        <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Decision Log
        </h3>
        <p className="text-sm text-surface-500 text-center py-4">
          No decisions logged yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-800/30 rounded-xl border border-surface-700 p-4">
      <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-blue-400" />
        Decision Log
        <span className="ml-auto px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs">
          {decisions.length}
        </span>
      </h3>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {sortedDecisions.map((decision, index) => (
          <div
            key={decision.id}
            className="p-3 rounded-lg bg-surface-800/50 border border-surface-700 animate-slide-up"
            style={{ animationDelay: `${index * 0.03}s`, animationFillMode: 'forwards' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-3 h-3 text-surface-500" />
              <span className="text-xs font-mono text-surface-500">
                {new Date(decision.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>

            <p className="text-sm font-medium text-surface-200 mb-1">
              {decision.decision}
            </p>

            <p className="text-xs text-surface-500 italic">
              "{decision.rationale}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
