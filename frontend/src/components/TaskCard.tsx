import { 
  AlertCircle, 
  Clock, 
  GitBranch, 
  Zap, 
  ChevronRight,
  Lock,
  Hourglass,
  CheckCircle2,
  Circle,
  GripVertical,
} from 'lucide-react';
import type { WeightedTask } from '../types';
import { 
  cn, 
  getPriorityBgClass, 
  getStatusLabel, 
  getEffortLabel,
  formatScore,
  scoreToUrgency,
} from '../lib/utils';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedTask } from '../store';

interface TaskCardProps {
  task: WeightedTask;
  index: number;
  isCompact?: boolean;
  // V3.2: Drag-and-drop props
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent, taskId: string, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  draggable?: boolean;
}

export function TaskCard({ 
  task, 
  index, 
  isCompact = false,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  draggable = true,
}: TaskCardProps) {
  const dispatch = useAppDispatch();
  const selectedTaskId = useAppSelector((state) => state.ui.selectedTaskId);
  const isSelected = selectedTaskId === task.id;
  const urgency = scoreToUrgency(task.priorityScore);

  const _StatusIcon = {
    not_started: Circle,
    in_progress: Zap,
    blocked: Lock,
    waiting: Hourglass,
    complete: CheckCircle2,
  }[task.status] || Circle;
  void _StatusIcon; // Available for future use

  const handleClick = () => {
    dispatch(setSelectedTask(isSelected ? null : task.id));
  };

  // V3.2: Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, task.id, index);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Required to allow drop
    if (onDragOver) {
      onDragOver(e, index);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (onDrop) {
      onDrop(e, index);
    }
  };

  if (isCompact) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'task-card w-full text-left p-3 rounded-lg border transition-all',
          'bg-surface-800/50 border-surface-700 hover:border-surface-600',
          isSelected && 'ring-2 ring-green-500/50 border-green-500/50'
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-bold text-white',
            getPriorityBgClass(task.priority)
          )}>
            {task.priority}
          </span>
          <span className="text-sm text-surface-200 truncate flex-1">{task.task}</span>
          <span className="text-xs font-mono text-surface-500">
            {formatScore(task.priorityScore)}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        'task-card w-full text-left p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing',
        'animate-slide-in-left',
        isSelected 
          ? 'bg-surface-800 border-green-500/50 ring-2 ring-green-500/30' 
          : 'bg-surface-800/50 border-surface-700 hover:border-surface-600',
        urgency === 'critical' && 'border-l-4 border-l-red-500',
        urgency === 'high' && 'border-l-4 border-l-amber-500',
        // V3.2: Drag states
        isDragging && 'opacity-50 scale-[0.98] ring-2 ring-blue-500/50',
        isDragOver && 'ring-2 ring-green-500/70 bg-green-500/10 border-green-500/50',
      )}
      style={{ animationDelay: `${index * 0.03}s`, animationFillMode: 'forwards' }}
    >
      <div className="flex items-start gap-4">
        {/* Drag Handle */}
        <div className="flex items-center justify-center w-6 h-full text-surface-600 hover:text-surface-400 transition-colors">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Priority Score Orb */}
        <div className={cn(
          'flex flex-col items-center justify-center w-14 h-14 rounded-xl',
          'bg-gradient-to-br',
          urgency === 'critical' && 'from-red-500/20 to-red-600/10 border border-red-500/30',
          urgency === 'high' && 'from-amber-500/20 to-amber-600/10 border border-amber-500/30',
          urgency === 'medium' && 'from-blue-500/20 to-blue-600/10 border border-blue-500/30',
          urgency === 'low' && 'from-surface-700 to-surface-800 border border-surface-600',
        )}>
          <span className={cn(
            'text-lg font-bold font-mono',
            urgency === 'critical' && 'text-red-400',
            urgency === 'high' && 'text-amber-400',
            urgency === 'medium' && 'text-blue-400',
            urgency === 'low' && 'text-surface-400',
          )}>
            {formatScore(task.priorityScore)}
          </span>
          <span className="text-[9px] text-surface-500 uppercase">score</span>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-bold text-white',
              getPriorityBgClass(task.priority)
            )}>
              {task.priority}
            </span>
            <span className="text-xs font-mono text-surface-500">{task.id}</span>
            <div className="flex items-center gap-1 ml-auto">
              <div className={cn('status-dot', task.status)} />
              <span className="text-xs text-surface-400">{getStatusLabel(task.status)}</span>
            </div>
          </div>

          {/* Task Title */}
          <h3 className="text-sm font-medium text-surface-100 mb-2 leading-tight">
            {task.task}
          </h3>

          {/* Meta Row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-surface-500">
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {task.project}
            </span>
            {task.effort && (
              <span className="flex items-center gap-1">
                {getEffortLabel(task.effort)}
              </span>
            )}
            {task.blocking && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertCircle className="w-3 h-3" />
                Blocks: {task.blocking}
              </span>
            )}
            {task.deadline && (
              <span className="flex items-center gap-1 text-red-400">
                <Clock className="w-3 h-3" />
                Due: {new Date(task.deadline).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Notes */}
          {task.notes && (
            <p className="mt-2 text-xs text-surface-500 italic truncate">
              {task.notes}
            </p>
          )}
        </div>

        {/* Arrow */}
        <ChevronRight className={cn(
          'w-5 h-5 text-surface-600 transition-transform',
          isSelected && 'transform rotate-90 text-green-400'
        )} />
      </div>

      {/* Weights Preview (expanded when selected) */}
      {isSelected && (
        <div className="mt-4 pt-4 border-t border-surface-700 animate-fade-in">
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Blocking', value: task.weights.blockingCount, max: 10 },
              { label: 'Cross-Project', value: task.weights.crossProjectImpact, max: 1 },
              { label: 'Time Sensitive', value: task.weights.timeSensitivity, max: 10 },
              { label: 'Effort/Value', value: task.weights.effortValueRatio, max: 9 },
              { label: 'Dep Depth', value: task.weights.dependencyDepth, max: 5 },
            ].map(({ label, value, max }) => (
              <div key={label} className="text-center">
                <div className="text-lg font-bold text-surface-200 font-mono">{value}</div>
                <div className="text-[9px] text-surface-500 uppercase">{label}</div>
                <div className="mt-1 h-1 bg-surface-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

