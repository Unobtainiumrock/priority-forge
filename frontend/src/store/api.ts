/**
 * RTK Query API Definition
 * 
 * This is the recommended way to handle data fetching in Redux Toolkit.
 * Benefits:
 * - Automatic caching and cache invalidation
 * - Automatic loading/error states
 * - Built-in polling support
 * - Optimistic updates
 * - Better TypeScript inference
 */

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { 
  UnifiedProgress, 
  HeuristicWeights, 
  WeightedTask,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3456';

export const priorityApi = createApi({
  reducerPath: 'priorityApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE }),
  tagTypes: ['Status', 'Tasks', 'Weights'],
  endpoints: (builder) => ({
    // GET /status - Main data fetch
    getStatus: builder.query<UnifiedProgress, void>({
      query: () => '/status',
      providesTags: ['Status', 'Tasks', 'Weights'],
    }),

    // GET /top-priority
    getTopPriority: builder.query<{ task: WeightedTask; explanation: string }, void>({
      query: () => '/top-priority',
      providesTags: ['Tasks'],
    }),

    // GET /heuristic-weights
    getHeuristicWeights: builder.query<HeuristicWeights, void>({
      query: () => '/heuristic-weights',
      providesTags: ['Weights'],
    }),

    // PUT /heuristic-weights - Update weights
    updateHeuristicWeights: builder.mutation<
      { message: string; weights: HeuristicWeights },
      Partial<HeuristicWeights>
    >({
      query: (weights) => ({
        url: '/heuristic-weights',
        method: 'PUT',
        body: weights,
      }),
      // Invalidate cache to trigger refetch
      invalidatesTags: ['Status', 'Weights', 'Tasks'],
    }),

    // POST /recalculate - Recalculate all priorities
    recalculatePriorities: builder.mutation<
      { message: string; taskCount: number; topPriority: WeightedTask | null },
      void
    >({
      query: () => ({
        url: '/recalculate',
        method: 'POST',
      }),
      invalidatesTags: ['Status', 'Tasks'],
    }),

    // PATCH /tasks/:id - Update task
    updateTask: builder.mutation<WeightedTask, { id: string; updates: Partial<WeightedTask> }>({
      query: ({ id, updates }) => ({
        url: `/tasks/${id}`,
        method: 'PATCH',
        body: updates,
      }),
      // Optimistic update
      async onQueryStarted({ id, updates }, { dispatch, queryFulfilled }) {
        // Optimistically update the cache
        const patchResult = dispatch(
          priorityApi.util.updateQueryData('getStatus', undefined, (draft) => {
            const task = draft.priorityQueue.find(t => t.id === id);
            if (task) {
              Object.assign(task, updates);
            }
          })
        );
        try {
          await queryFulfilled;
        } catch {
          // Revert on error
          patchResult.undo();
        }
      },
      invalidatesTags: ['Tasks'],
    }),

    // POST /tasks - Create task
    createTask: builder.mutation<WeightedTask, Partial<WeightedTask>>({
      query: (task) => ({
        url: '/tasks',
        method: 'POST',
        body: task,
      }),
      invalidatesTags: ['Status', 'Tasks'],
    }),

    // DELETE /tasks/:id - Delete task
    deleteTask: builder.mutation<void, string>({
      query: (id) => ({
        url: `/tasks/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Status', 'Tasks'],
    }),

    // V3.2: Online Learning - Log drag reorder
    logDragReorder: builder.mutation<
      {
        event: {
          id: string;
          taskId: string;
          fromRank: number;
          toRank: number;
          direction: 'promoted' | 'demoted';
          implicitPreferences: Array<{
            preferredTaskId: string;
            demotedTaskId: string;
            scoreDiff: number;
          }>;
          appliedWeightDelta?: Partial<HeuristicWeights>;
        };
        pairsGenerated: number;
        weightUpdateApplied: boolean;
      },
      { taskId: string; fromRank: number; toRank: number }
    >({
      query: (params) => ({
        url: '/drag-reorder',
        method: 'POST',
        body: params,
      }),
      // Invalidate to refetch updated weights and scores
      invalidatesTags: ['Status', 'Tasks', 'Weights'],
    }),

    // V3.2: Get online learner state
    getOnlineLearnerState: builder.query<
      {
        totalUpdates: number;
        totalPairs: number;
        correctPredictions: number;
        accuracy: number;
        cumulativeLoss: number;
        currentWeights: HeuristicWeights;
        learningRate: number;
        enabled: boolean;
      },
      void
    >({
      query: () => '/online-learner',
      providesTags: ['Weights'],
    }),
  }),
});

// Export hooks for usage in components
export const {
  useGetStatusQuery,
  useGetTopPriorityQuery,
  useGetHeuristicWeightsQuery,
  useUpdateHeuristicWeightsMutation,
  useRecalculatePrioritiesMutation,
  useUpdateTaskMutation,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useLogDragReorderMutation,
  useGetOnlineLearnerStateQuery,
} = priorityApi;
