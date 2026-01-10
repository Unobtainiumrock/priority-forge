/**
 * Typed Redux Hooks
 * 
 * Using the modern RTK approach with .withTypes<>()
 * This ensures type safety when using useDispatch and useSelector
 */

import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './index';

// Pre-typed hooks - use these throughout the app instead of plain useDispatch/useSelector
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
