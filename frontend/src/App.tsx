import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { ProjectFilter } from './components/ProjectFilter';
import { PriorityQueueList } from './components/PriorityQueueList';
import { DecisionsPanel } from './components/DecisionsPanel';
import { HeuristicWeightTuner } from './components/HeuristicWeightTuner';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { useGetStatusQuery, useGetVersionQuery } from './store';
import { useAppSelector } from './store/hooks';
import { selectHeuristicWeights } from './store/selectors';

// Polling interval in milliseconds
const POLL_INTERVAL = 5000;

function App() {
  // RTK Query hook with automatic polling
  const { 
    data, 
    isLoading, 
    isError, 
    isFetching,
    error,
  } = useGetStatusQuery(undefined, {
    pollingInterval: POLL_INTERVAL,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Fetch version info (cached, no polling needed)
  const { data: versionInfo } = useGetVersionQuery();

  const heuristicWeights = useAppSelector(selectHeuristicWeights);
  const isConnected = !!data && !isError;

  return (
    <div className="min-h-screen">
      <Header 
        isConnected={isConnected} 
        isFetching={isFetching}
        topPriority={data?.topPriority}
        taskCount={data?.priorityQueue?.length ?? 0}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error State */}
        {isError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-sm text-red-400">
                Unable to connect to backend at localhost:3456
              </span>
              <span className="text-xs text-surface-500 ml-auto">
                {(error as Error)?.message || 'Connection failed'}
              </span>
            </div>
          </div>
        )}

        {/* Loading State (initial) */}
        {isLoading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center animate-fade-in">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-surface-700" />
                <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
              </div>
              <p className="text-surface-400">Loading priority queue...</p>
              <p className="text-xs text-surface-500 mt-2">
                Syncing with backend heap
              </p>
            </div>
          </div>
        )}

        {/* Main Dashboard - Always show, even if empty */}
        {data && (
          <>
            {/* Stats Overview */}
            <StatsBar />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Sidebar - Filters & Info */}
              <div className="space-y-6">
                <WorkspaceSwitcher />
                <ProjectFilter />
                <DecisionsPanel />
              </div>

              {/* Main Content - Priority Queue */}
              <div className="lg:col-span-3">
                <PriorityQueueList />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-surface-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-surface-500">
          <span>{versionInfo?.fullName ?? 'Priority Forge'} — Task Prioritization Dashboard</span>
          <div className="flex items-center gap-4">
            {heuristicWeights && (
              <span className="font-mono">
                Blocking: {heuristicWeights.blocking} | 
                CrossProject: {heuristicWeights.crossProject} | 
                TimeSensitive: {heuristicWeights.timeSensitive}
              </span>
            )}
            <span className="text-surface-600">|</span>
            <span>
              {isConnected ? '🟢 Synced' : '🔴 Disconnected'}
              {isFetching && ' (syncing...)'}
            </span>
          </div>
        </div>
      </footer>

      {/* Heuristic Weight Tuner Panel */}
      <HeuristicWeightTuner />
    </div>
  );
}

export default App;
