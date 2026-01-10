import { Activity, Wifi, WifiOff, RefreshCw, Sliders, Zap, Loader2 } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { toggleWeightsPanel, useGetStatusQuery } from '../store';
import { selectTaskStats } from '../store/selectors';
import { cn } from '../lib/utils';
import type { WeightedTask } from '../types';

interface HeaderProps {
  isConnected: boolean;
  isFetching: boolean;
  topPriority?: WeightedTask | null;
  taskCount: number;
}

export function Header({ isConnected, isFetching, topPriority, taskCount }: HeaderProps) {
  const dispatch = useAppDispatch();
  const { refetch } = useGetStatusQuery();
  const taskStats = useAppSelector(selectTaskStats);
  const isWeightsPanelOpen = useAppSelector((state) => state.ui.isWeightsPanelOpen);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <header className="sticky top-0 z-50 bg-surface-950/90 backdrop-blur-xl border-b border-surface-800">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-100 font-display">
                Priority Forge
              </h1>
              <p className="text-xs text-surface-500">
                Task Prioritization Dashboard
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-6">
            {/* Top Priority Preview */}
            {topPriority && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800/50 border border-surface-700">
                <Zap className="w-4 h-4 text-amber-400" />
                <div className="text-left max-w-[200px]">
                  <span className="text-xs text-surface-500 block">Top Priority</span>
                  <span className="text-sm text-surface-200 truncate block">
                    [{topPriority.id}] {topPriority.task.slice(0, 25)}...
                  </span>
                </div>
              </div>
            )}

            {/* Stats Pills */}
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-md bg-surface-800 text-xs">
                <span className="text-surface-500">Tasks:</span>{' '}
                <span className="text-surface-200 font-medium">{taskCount}</span>
              </div>
              {taskStats.p0Count > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-xs">
                  <span className="text-red-400 font-medium">{taskStats.p0Count} P0</span>
                </div>
              )}
              {taskStats.blocked > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-xs animate-pulse">
                  <span className="text-red-400 font-medium">{taskStats.blocked} Blocked</span>
                </div>
              )}
              {taskStats.inProgress > 0 && (
                <div className="px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/30 text-xs">
                  <span className="text-green-400 font-medium">{taskStats.inProgress} Active</span>
                </div>
              )}
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-3">
            {/* Heuristic Weights Toggle */}
            <button
              onClick={() => dispatch(toggleWeightsPanel())}
              className={cn(
                'p-2 rounded-lg transition-all duration-200',
                isWeightsPanelOpen
                  ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                  : 'bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700'
              )}
              title="Tune Heuristic Weights"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className={cn(
                'p-2 rounded-lg bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors',
                isFetching && 'text-green-400'
              )}
              title="Refresh"
            >
              {isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>

            {/* Connection Status */}
            <div className="flex items-center gap-2 pl-3 border-l border-surface-700">
              {isConnected ? (
                <div className="flex items-center gap-1.5 text-green-400">
                  <Wifi className="w-4 h-4" />
                  <span className="text-xs font-medium">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-400">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-xs font-medium">Disconnected</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
