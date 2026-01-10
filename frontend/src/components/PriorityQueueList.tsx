import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectFilteredTasks, selectSortedTasks } from '../store/selectors';
import { setFilterPriority, setFilterStatus, setSearchQuery, resetFilters } from '../store';
import { TaskCard } from './TaskCard';
import { ListFilter, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Priority, TaskStatus } from '../types';

const PRIORITY_OPTIONS: (Priority | 'all')[] = ['all', 'P0', 'P1', 'P2', 'P3'];
const STATUS_OPTIONS: (TaskStatus | 'all')[] = ['all', 'not_started', 'in_progress', 'blocked', 'waiting'];

export function PriorityQueueList() {
  const dispatch = useAppDispatch();
  const allTasks = useAppSelector(selectSortedTasks);
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const filterProject = useAppSelector((state) => state.ui.filterProject);
  const filterPriority = useAppSelector((state) => state.ui.filterPriority);
  const filterStatus = useAppSelector((state) => state.ui.filterStatus);
  const searchQuery = useAppSelector((state) => state.ui.searchQuery);

  const hasFilters = filterProject !== 'all' || filterPriority !== 'all' || filterStatus !== 'all' || searchQuery;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filter Bar */}
      <div className="mb-4 p-4 bg-surface-800/30 rounded-xl border border-surface-700">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => dispatch(setSearchQuery(e.target.value))}
              className="w-full pl-9 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/30"
            />
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1">
            <ListFilter className="w-4 h-4 text-surface-500" />
            <div className="flex rounded-lg overflow-hidden border border-surface-700">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => dispatch(setFilterPriority(p))}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    filterPriority === p
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700'
                  )}
                >
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => dispatch(setFilterStatus(e.target.value as TaskStatus | 'all'))}
            className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-200 focus:outline-none focus:border-green-500/50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Status' : s.replace('_', ' ')}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={() => dispatch(resetFilters())}
              className="flex items-center gap-1 px-3 py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-surface-500">
          Showing {filteredTasks.length} of {allTasks.length} tasks
        </span>
        {filteredTasks.length > 0 && (
          <span className="text-xs text-surface-500">
            Sorted by priority score (lower = higher priority)
          </span>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-surface-600" />
            </div>
            <h3 className="text-surface-300 font-medium mb-1">No tasks found</h3>
            <p className="text-sm text-surface-500">
              {hasFilters ? 'Try adjusting your filters' : 'No tasks in the queue'}
            </p>
          </div>
        ) : (
          filteredTasks.map((task, index) => (
            <TaskCard key={task.id} task={task} index={index} />
          ))
        )}
      </div>
    </div>
  );
}
