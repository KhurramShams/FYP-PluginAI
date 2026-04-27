import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Workspace {
  id: string;
  name: string;
  docs_count: number;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setWorkspaces: (ws: Workspace[]) => void;
  setActiveWorkspace: (ws: Workspace | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspace: null,
      setWorkspaces: (ws) => set({ workspaces: ws }),
      setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),
    }),
    {
      name: 'plugin-ai-workspace-storage', // name of the item in the storage (must be unique)
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }), // Only persist activeWorkspace
    }
  )
);
