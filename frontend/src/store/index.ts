/**
 * Redux Store Configuration
 * 
 * Following Redux Toolkit best practices:
 * - Use configureStore (enables Redux DevTools, thunk middleware)
 * - Use RTK Query for data fetching
 * - Export typed hooks
 * - Export RootState and AppDispatch types
 */

import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { priorityApi } from './api';
import uiReducer from './uiSlice';

export const store = configureStore({
  reducer: {
    // RTK Query reducer
    [priorityApi.reducerPath]: priorityApi.reducer,
    // UI state reducer
    ui: uiReducer,
  },
  // Adding the api middleware enables caching, invalidation, polling, etc.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(priorityApi.middleware),
});

// Enable refetch on focus/reconnect
setupListeners(store.dispatch);

// Infer types from the store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Re-export everything for convenience
export * from './api';
export * from './uiSlice';
export * from './selectors';
