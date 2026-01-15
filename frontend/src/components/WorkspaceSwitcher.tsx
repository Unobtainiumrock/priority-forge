import { useState, useEffect, useRef } from 'react';
import { 
  useGetWorkspacesQuery, 
  useGetCurrentWorkspaceQuery,
  useCreateWorkspaceMutation,
  useSwitchWorkspaceMutation,
  useDeleteWorkspaceMutation,
  priorityApi,
} from '../store/api';
import { useDispatch } from 'react-redux';
import { FolderOpen, Plus, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';

// Poll workspace every 1 second to detect external changes (MCP, etc.)
const WORKSPACE_POLL_INTERVAL = 1000;

export function WorkspaceSwitcher() {
  const dispatch = useDispatch();
  const { data: workspacesData, isLoading: workspacesLoading } = useGetWorkspacesQuery(undefined, {
    pollingInterval: WORKSPACE_POLL_INTERVAL,
  });
  const { data: currentWorkspaceData } = useGetCurrentWorkspaceQuery(undefined, {
    pollingInterval: WORKSPACE_POLL_INTERVAL,
  });
  const [createWorkspace] = useCreateWorkspaceMutation();
  const [switchWorkspace] = useSwitchWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  
  // Track previous workspace to detect external changes
  const prevWorkspaceIdRef = useRef<string | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const workspaces = workspacesData?.workspaces || [];
  const currentWorkspaceId = currentWorkspaceData?.workspaceId || workspacesData?.currentWorkspaceId || null;
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  // Detect external workspace changes (e.g., from MCP) and trigger full refetch
  useEffect(() => {
    if (currentWorkspaceId && prevWorkspaceIdRef.current !== null && currentWorkspaceId !== prevWorkspaceIdRef.current) {
      // Workspace changed externally! Invalidate all data to trigger refetch
      console.log(`Workspace changed externally: ${prevWorkspaceIdRef.current} → ${currentWorkspaceId}`);
      dispatch(priorityApi.util.invalidateTags(['Status', 'Tasks', 'Weights']));
    }
    prevWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId, dispatch]);

  const handleCreate = async () => {
    if (!newWorkspaceName.trim()) return;
    
    try {
      await createWorkspace({
        name: newWorkspaceName.trim(),
        description: newWorkspaceDesc.trim() || undefined,
      }).unwrap();
      setNewWorkspaceName('');
      setNewWorkspaceDesc('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create workspace:', error);
    }
  };

  const handleSwitch = async (workspaceId: string) => {
    try {
      await switchWorkspace(workspaceId).unwrap();
    } catch (error) {
      console.error('Failed to switch workspace:', error);
    }
  };

  const handleDelete = async (workspaceId: string) => {
    if (workspaceId === currentWorkspaceId) {
      alert('Cannot delete the current workspace. Switch to another workspace first.');
      return;
    }
    
    try {
      await deleteWorkspace(workspaceId).unwrap();
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete workspace');
    }
  };

  if (workspacesLoading) {
    return (
      <div className="p-4 bg-surface-800/30 rounded-xl border border-surface-700">
        <div className="text-sm text-surface-400">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-surface-800/30 rounded-xl border border-surface-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          Workspaces
        </h3>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
            title="Create workspace"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Create Workspace Form */}
      {isCreating && (
        <div className="mb-3 p-3 bg-surface-800 rounded-lg border border-surface-600">
          <input
            type="text"
            placeholder="Workspace name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-green-500/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewWorkspaceName('');
                setNewWorkspaceDesc('');
              }
            }}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newWorkspaceDesc}
            onChange={(e) => setNewWorkspaceDesc(e.target.value)}
            className="w-full mb-2 px-3 py-2 bg-surface-900 border border-surface-600 rounded text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-green-500/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex-1 px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-xs font-medium hover:bg-green-500/30 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewWorkspaceName('');
                setNewWorkspaceDesc('');
              }}
              className="px-3 py-1.5 bg-surface-700 text-surface-400 rounded text-xs font-medium hover:bg-surface-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Workspace List */}
      <div className="space-y-1">
        {workspaces.length === 0 ? (
          <div className="text-xs text-surface-500 py-2 text-center">
            No workspaces yet. Create one to get started.
          </div>
        ) : (
          workspaces.map((workspace) => {
            const isCurrent = workspace.id === currentWorkspaceId;
            const isDeleting = showDeleteConfirm === workspace.id;
            
            return (
              <div
                key={workspace.id}
                className={cn(
                  'group flex items-center gap-2 p-2 rounded-lg transition-colors',
                  isCurrent
                    ? 'bg-green-500/20 border border-green-500/30'
                    : 'hover:bg-surface-700/50'
                )}
              >
                {isDeleting ? (
                  <>
                    <div className="flex-1 text-xs text-surface-300">
                      Delete "{workspace.name}"?
                    </div>
                    <button
                      onClick={() => handleDelete(workspace.id)}
                      className="p-1 text-red-400 hover:text-red-300"
                      title="Confirm delete"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="p-1 text-surface-400 hover:text-surface-300"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSwitch(workspace.id)}
                      className="flex-1 text-left text-xs text-surface-200 hover:text-surface-100 transition-colors"
                    >
                      <div className="font-medium">{workspace.name}</div>
                      {workspace.description && (
                        <div className="text-surface-500 mt-0.5">{workspace.description}</div>
                      )}
                    </button>
                    {isCurrent && (
                      <div className="w-2 h-2 rounded-full bg-green-400" title="Current workspace" />
                    )}
                    {!isCurrent && (
                      <button
                        onClick={() => setShowDeleteConfirm(workspace.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-surface-500 hover:text-red-400 transition-all"
                        title="Delete workspace"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Current Workspace Indicator */}
      {currentWorkspace && (
        <div className="mt-3 pt-3 border-t border-surface-700">
          <div className="text-xs text-surface-500">Current:</div>
          <div className="text-sm font-medium text-surface-200 mt-0.5">
            {currentWorkspace.name}
          </div>
        </div>
      )}
    </div>
  );
}
