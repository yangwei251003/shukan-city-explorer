import { createContext, useContext } from 'react';
import type { Catalog, RegionConfig, Dataset } from '../types';
import type { useAppState } from './useAppState';
export type AppState = ReturnType<typeof useAppState> & { catalog:Catalog; region:RegionConfig; dataset:Dataset };
export const AppContext = createContext<AppState|null>(null);
export function useApp(){const value=useContext(AppContext);if(!value)throw Error('AppContext missing');return value;}
