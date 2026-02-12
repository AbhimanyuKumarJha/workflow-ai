import { create } from 'zustand';

interface UIState {
    // Sidebar state
    leftSidebarOpen: boolean;
    rightSidebarOpen: boolean;

    // Selection state
    selectedNodes: Set<string>;

    // Execution state
    executingNodes: Set<string>;
    isExecuting: boolean;

    // Actions
    toggleLeftSidebar: () => void;
    toggleRightSidebar: () => void;
    setLeftSidebarOpen: (open: boolean) => void;
    setRightSidebarOpen: (open: boolean) => void;

    selectNode: (nodeId: string) => void;
    deselectNode: (nodeId: string) => void;
    clearSelection: () => void;
    setSelectedNodes: (nodeIds: string[]) => void;

    startExecutingNode: (nodeId: string) => void;
    stopExecutingNode: (nodeId: string) => void;
    clearExecutingNodes: () => void;
    setIsExecuting: (executing: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    // Initial state
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    selectedNodes: new Set<string>(),
    executingNodes: new Set<string>(),
    isExecuting: false,

    // Sidebar actions
    toggleLeftSidebar: () =>
        set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),

    toggleRightSidebar: () =>
        set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),

    setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),

    setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),

    // Selection actions
    selectNode: (nodeId) =>
        set((state) => {
            const newSelection = new Set(state.selectedNodes);
            newSelection.add(nodeId);
            return { selectedNodes: newSelection };
        }),

    deselectNode: (nodeId) =>
        set((state) => {
            const newSelection = new Set(state.selectedNodes);
            newSelection.delete(nodeId);
            return { selectedNodes: newSelection };
        }),

    clearSelection: () => set({ selectedNodes: new Set<string>() }),

    setSelectedNodes: (nodeIds) =>
        set({ selectedNodes: new Set(nodeIds) }),

    // Execution actions
    startExecutingNode: (nodeId) =>
        set((state) => {
            const newExecuting = new Set(state.executingNodes);
            newExecuting.add(nodeId);
            return { executingNodes: newExecuting, isExecuting: true };
        }),

    stopExecutingNode: (nodeId) =>
        set((state) => {
            const newExecuting = new Set(state.executingNodes);
            newExecuting.delete(nodeId);
            return {
                executingNodes: newExecuting,
                isExecuting: newExecuting.size > 0,
            };
        }),

    clearExecutingNodes: () =>
        set({ executingNodes: new Set<string>(), isExecuting: false }),

    setIsExecuting: (executing) => set({ isExecuting: executing }),
}));
