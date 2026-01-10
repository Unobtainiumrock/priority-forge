import { Folder, FolderOpen, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setFilterProject } from '../store';
import { selectProjects, selectProjectTaskCounts, selectPriorityQueue } from '../store/selectors';
import { cn } from '../lib/utils';

export function ProjectFilter() {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const tasks = useAppSelector(selectPriorityQueue);
  const projectCounts = useAppSelector(selectProjectTaskCounts);
  const currentFilter = useAppSelector((state) => state.ui.filterProject);

  const totalTasks = tasks.length;

  return (
    <div className="bg-surface-800/30 rounded-xl border border-surface-700 p-4">
      <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">
        Filter by Project
      </h3>

      <div className="space-y-1">
        {/* All Projects */}
        <button
          onClick={() => dispatch(setFilterProject('all'))}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all',
            currentFilter === 'all'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'hover:bg-surface-700/50 text-surface-300 hover:text-surface-100'
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="flex-1 text-left text-sm">All Projects</span>
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-mono',
            currentFilter === 'all' ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-surface-400'
          )}>
            {totalTasks}
          </span>
        </button>

        {/* Individual Projects */}
        {projects.map((project: typeof projects[number]) => {
          const isActive = currentFilter === project.name;
          const count = projectCounts[project.name] || 0;
          const StatusIcon = project.status === 'complete' ? CheckCircle2 : 
                            project.status === 'blocked' ? AlertCircle : Folder;
          
          return (
            <button
              key={project.id}
              onClick={() => dispatch(setFilterProject(project.name))}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all',
                isActive
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'hover:bg-surface-700/50 text-surface-300 hover:text-surface-100',
                project.status === 'complete' && !isActive && 'opacity-60'
              )}
            >
              <StatusIcon className={cn(
                'w-4 h-4',
                project.status === 'complete' && 'text-blue-400',
                project.status === 'blocked' && 'text-red-400',
                project.status === 'active' && 'text-green-400',
              )} />
              <div className="flex-1 text-left">
                <span className="text-sm block">{project.name}</span>
                <span className="text-[10px] text-surface-500 block truncate">
                  {project.primaryFocus}
                </span>
              </div>
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-mono',
                isActive ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-surface-400'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
