import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ViewMode, FilterProject, FilterPriority, FilterStatus } from '../types';

interface UIState {
  viewMode: ViewMode;
  filterProject: FilterProject;
  filterPriority: FilterPriority;
  filterStatus: FilterStatus;
  selectedTaskId: string | null;
  isWeightsPanelOpen: boolean;
  isDetailsPanelOpen: boolean;
  searchQuery: string;
}

const initialState: UIState = {
  viewMode: 'list',
  filterProject: 'all',
  filterPriority: 'all',
  filterStatus: 'all',
  selectedTaskId: null,
  isWeightsPanelOpen: false,
  isDetailsPanelOpen: false,
  searchQuery: '',
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload;
    },
    setFilterProject: (state, action: PayloadAction<FilterProject>) => {
      state.filterProject = action.payload;
    },
    setFilterPriority: (state, action: PayloadAction<FilterPriority>) => {
      state.filterPriority = action.payload;
    },
    setFilterStatus: (state, action: PayloadAction<FilterStatus>) => {
      state.filterStatus = action.payload;
    },
    setSelectedTask: (state, action: PayloadAction<string | null>) => {
      state.selectedTaskId = action.payload;
      state.isDetailsPanelOpen = action.payload !== null;
    },
    toggleWeightsPanel: (state) => {
      state.isWeightsPanelOpen = !state.isWeightsPanelOpen;
    },
    setWeightsPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.isWeightsPanelOpen = action.payload;
    },
    closeDetailsPanel: (state) => {
      state.isDetailsPanelOpen = false;
      state.selectedTaskId = null;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    resetFilters: (state) => {
      state.filterProject = 'all';
      state.filterPriority = 'all';
      state.filterStatus = 'all';
      state.searchQuery = '';
    },
  },
});

export const {
  setViewMode,
  setFilterProject,
  setFilterPriority,
  setFilterStatus,
  setSelectedTask,
  toggleWeightsPanel,
  setWeightsPanelOpen,
  closeDetailsPanel,
  setSearchQuery,
  resetFilters,
} = uiSlice.actions;

export default uiSlice.reducer;

