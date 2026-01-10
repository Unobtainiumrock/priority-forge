import { useCallback, useRef, useState } from 'react';
import { X, RotateCcw, Save, Info, Loader2 } from 'lucide-react';
import type { HeuristicWeights } from '../types';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { 
  setWeightsPanelOpen, 
  useUpdateHeuristicWeightsMutation,
  useGetStatusQuery,
} from '../store';
import { selectHeuristicWeights } from '../store/selectors';
import { cn } from '../lib/utils';

const WEIGHT_CONFIG = [
  {
    key: 'blocking' as const,
    label: 'Blocking',
    description: 'Weight for tasks that unblock other work',
    min: 0,
    max: 20,
    default: 10,
    color: 'from-red-500 to-red-600',
  },
  {
    key: 'crossProject' as const,
    label: 'Cross-Project',
    description: 'Weight for tasks affecting multiple projects',
    min: 0,
    max: 15,
    default: 5,
    color: 'from-purple-500 to-purple-600',
  },
  {
    key: 'timeSensitive' as const,
    label: 'Time Sensitive',
    description: 'Weight for deadline proximity',
    min: 0,
    max: 15,
    default: 8,
    color: 'from-amber-500 to-amber-600',
  },
  {
    key: 'effortValue' as const,
    label: 'Effort/Value',
    description: 'Weight for quick-win opportunities',
    min: 0,
    max: 10,
    default: 3,
    color: 'from-green-500 to-green-600',
  },
  {
    key: 'dependency' as const,
    label: 'Dependency',
    description: 'Weight for dependency chain depth',
    min: 0,
    max: 10,
    default: 2,
    color: 'from-blue-500 to-blue-600',
  },
];

const DEFAULT_WEIGHTS: HeuristicWeights = {
  blocking: 10,
  crossProject: 5,
  timeSensitive: 8,
  effortValue: 3,
  dependency: 2,
};

// Throttle function for weight updates
function useThrottledCallback(
  callback: (weights: HeuristicWeights) => void,
  delay: number
) {
  const lastCall = useRef<number>(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback((weights: HeuristicWeights) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall.current);

    if (remaining <= 0) {
      lastCall.current = now;
      callback(weights);
    } else {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        lastCall.current = Date.now();
        callback(weights);
      }, remaining);
    }
  }, [callback, delay]);
}

export function HeuristicWeightTuner() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isWeightsPanelOpen);
  const serverWeights = useAppSelector(selectHeuristicWeights);
  
  // Local state for immediate slider feedback
  const [localWeights, setLocalWeights] = useState<HeuristicWeights>(
    serverWeights || DEFAULT_WEIGHTS
  );
  const [hoveredWeight, setHoveredWeight] = useState<string | null>(null);

  // RTK Query mutation hook
  const [updateWeights, { isLoading: isUpdating }] = useUpdateHeuristicWeightsMutation();
  const { refetch } = useGetStatusQuery();

  // Sync local weights when server weights change
  if (serverWeights && JSON.stringify(serverWeights) !== JSON.stringify(localWeights) && !isUpdating) {
    setLocalWeights(serverWeights);
  }

  const handleClose = () => {
    dispatch(setWeightsPanelOpen(false));
  };

  // Throttled API update
  const throttledUpdate = useThrottledCallback(async (newWeights) => {
    try {
      await updateWeights(newWeights).unwrap();
    } catch (error) {
      console.error('Failed to update weights:', error);
    }
  }, 500);

  const handleSliderChange = (key: keyof HeuristicWeights, value: number) => {
    const newWeights = { ...localWeights, [key]: value };
    setLocalWeights(newWeights);
    throttledUpdate(newWeights);
  };

  const handleReset = async () => {
    setLocalWeights(DEFAULT_WEIGHTS);
    try {
      await updateWeights(DEFAULT_WEIGHTS).unwrap();
      refetch();
    } catch (error) {
      console.error('Failed to reset weights:', error);
    }
  };

  const handleSave = async () => {
    try {
      await updateWeights(localWeights).unwrap();
      refetch();
    } catch (error) {
      console.error('Failed to save weights:', error);
    }
  };

  const hasChanges = serverWeights && 
    JSON.stringify(localWeights) !== JSON.stringify(serverWeights);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-surface-900/95 backdrop-blur-xl border-l border-surface-700 shadow-2xl z-40 animate-slide-in-left">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div>
            <h2 className="text-lg font-bold text-surface-100 font-display">
              Heuristic Weights
            </h2>
            <p className="text-xs text-surface-500">
              Tune how priorities are calculated
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sliders */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {WEIGHT_CONFIG.map((config) => (
            <div 
              key={config.key}
              className="group"
              onMouseEnter={() => setHoveredWeight(config.key)}
              onMouseLeave={() => setHoveredWeight(null)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-surface-200">
                    {config.label}
                  </span>
                  <div className="relative">
                    <Info className="w-3.5 h-3.5 text-surface-500 cursor-help" />
                    {hoveredWeight === config.key && (
                      <div className="absolute left-0 top-6 w-48 p-2 bg-surface-800 border border-surface-700 rounded-lg shadow-xl text-xs text-surface-400 z-10">
                        {config.description}
                      </div>
                    )}
                  </div>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded text-sm font-mono font-bold',
                  'bg-gradient-to-r text-white',
                  config.color
                )}>
                  {localWeights[config.key].toFixed(1)}
                </span>
              </div>

              <input
                type="range"
                min={config.min}
                max={config.max}
                step={0.5}
                value={localWeights[config.key]}
                onChange={(e) => handleSliderChange(config.key, parseFloat(e.target.value))}
                className="w-full"
              />

              <div className="flex justify-between text-xs text-surface-600 mt-1">
                <span>{config.min}</span>
                <span className="text-surface-500">default: {config.default}</span>
                <span>{config.max}</span>
              </div>
            </div>
          ))}

          {/* Formula Preview */}
          <div className="mt-6 p-4 bg-surface-800/50 rounded-xl border border-surface-700">
            <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
              Score Formula
            </h3>
            <code className="text-xs text-green-400 font-mono block leading-relaxed">
              score = base_priority - (<br />
              &nbsp;&nbsp;{localWeights.blocking.toFixed(1)} × blocking_count +<br />
              &nbsp;&nbsp;{localWeights.crossProject.toFixed(1)} × cross_project +<br />
              &nbsp;&nbsp;{localWeights.timeSensitive.toFixed(1)} × time_sensitivity +<br />
              &nbsp;&nbsp;{localWeights.effortValue.toFixed(1)} × effort_value +<br />
              &nbsp;&nbsp;{localWeights.dependency.toFixed(1)} × dependency_depth<br />
              )
            </code>
            <p className="mt-2 text-xs text-surface-500">
              Lower score = Higher priority
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-surface-700 flex gap-3">
          <button
            onClick={handleReset}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-800 text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isUpdating}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all',
              hasChanges && !isUpdating
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                : 'bg-surface-800 text-surface-500 cursor-not-allowed'
            )}
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Apply & Recalculate
          </button>
        </div>
      </div>
    </div>
  );
}
