import { create } from 'zustand';
import {
    Node,
    Edge,
    Connection,
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Viewport,
} from '@xyflow/react';
import { CustomNodeData, WorkflowSnapshot } from '@/lib/types';
import { getHandleDataType } from '@/lib/handle-registry';

// Debounce timer for history updates
let historyTimeout: NodeJS.Timeout | null = null;

interface HistoryState {
    past: WorkflowSnapshot[];
    present: WorkflowSnapshot;
    future: WorkflowSnapshot[];
}

interface WorkflowState {
    // Workflow data
    workflowId: string | null;
    workflowName: string;
    nodes: Node<CustomNodeData>[];
    edges: Edge[];
    viewport: Viewport;

    // History state
    history: HistoryState;

    // Actions
    setWorkflowId: (id: string | null) => void;
    setWorkflowName: (name: string) => void;
    setNodes: (nodes: Node<CustomNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    setViewport: (viewport: Viewport) => void;

    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;

    addNode: (
        type: string,
        position: { x: number; y: number },
        data: CustomNodeData
    ) => void;
    deleteNode: (id: string) => void;
    updateNodeData: (id: string, data: Partial<CustomNodeData>) => void;

    // History actions
    undo: () => void;
    redo: () => void;
    addToHistory: () => void;

    // Workflow actions
    saveWorkflow: () => Promise<void>;
    loadWorkflow: (id: string) => Promise<void>;
    exportJSON: () => string;
    importJSON: (json: string) => void;
    resetWorkflow: () => void;
}

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 };

const initialHistoryState: HistoryState = {
    past: [],
    present: { nodes: [], edges: [], viewport: initialViewport },
    future: [],
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    // Initial state
    workflowId: null,
    workflowName: 'Untitled workflow',
    nodes: [],
    edges: [],
    viewport: initialViewport,
    history: initialHistoryState,

    // Setters
    setWorkflowId: (id) => set({ workflowId: id }),
    setWorkflowName: (name) => set({ workflowName: name }),
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    setViewport: (viewport) => set({ viewport }),

    // React Flow handlers
    onNodesChange: (changes) => {
        set((state) => ({
            nodes: applyNodeChanges(changes, state.nodes) as Node<CustomNodeData>[],
        }));
        get().addToHistory();
    },

    onEdgesChange: (changes) => {
        set((state) => ({
            edges: applyEdgeChanges(changes, state.edges),
        }));
        get().addToHistory();
    },

    onConnect: (connection) => {
        const { nodes } = get();

        // Find source node to determine data type
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const dataType = sourceNode
            ? getHandleDataType(sourceNode.type!, connection.sourceHandle || '')
            : undefined;

        const newEdge: Edge = {
            id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
            source: connection.source!,
            target: connection.target!,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            type: 'custom',
            data: { dataType },
        };

        set((state) => ({
            edges: [...state.edges, newEdge],
        }));
        get().addToHistory();
    },

    // Node operations
    addNode: (type, position, data) => {
        const newNode: Node<CustomNodeData> = {
            id: `node-${Date.now()}`,
            type,
            position,
            data,
        };

        set((state) => ({
            nodes: [...state.nodes, newNode],
        }));
        get().addToHistory();
    },

    deleteNode: (id) => {
        set((state) => ({
            nodes: state.nodes.filter((node) => node.id !== id),
            edges: state.edges.filter(
                (edge) => edge.source !== id && edge.target !== id
            ),
        }));
        get().addToHistory();
    },

    updateNodeData: (id, data) => {
        set((state) => ({
            nodes: state.nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
        }));
    },

    // History operations
    undo: () => {
        const { history } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        set({
            history: {
                past: newPast,
                present: previous,
                future: [history.present, ...history.future],
            },
            nodes: previous.nodes,
            edges: previous.edges,
            viewport: previous.viewport,
        });
    },

    redo: () => {
        const { history } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        set({
            history: {
                past: [...history.past, history.present],
                present: next,
                future: newFuture,
            },
            nodes: next.nodes,
            edges: next.edges,
            viewport: next.viewport,
        });
    },

    addToHistory: () => {
        // Clear existing timeout
        if (historyTimeout) {
            clearTimeout(historyTimeout);
        }

        // Debounce history saves by 300ms
        historyTimeout = setTimeout(() => {
            const { nodes, edges, viewport, history } = get();
            const snapshot: WorkflowSnapshot = { nodes, edges, viewport };

            set({
                history: {
                    past: [...history.past, history.present],
                    present: snapshot,
                    future: [], // Clear future on new action
                },
            });
            historyTimeout = null;
        }, 300);
    },

    // Workflow persistence
    saveWorkflow: async () => {
        const { workflowId, workflowName, nodes, edges, viewport } = get();

        const payload = {
            name: workflowName,
            nodes,
            edges,
            viewport,
        };

        if (workflowId) {
            // Update existing workflow
            const response = await fetch(`/api/workflows/${workflowId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error('Failed to save workflow');
            }
        } else {
            // Create new workflow
            const response = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error('Failed to create workflow');
            }

            const data = await response.json();
            set({ workflowId: data.id });
        }
    },

    loadWorkflow: async (id) => {
        const response = await fetch(`/api/workflows/${id}`);

        if (!response.ok) {
            throw new Error('Failed to load workflow');
        }

        const data = await response.json();

        set({
            workflowId: data.id,
            workflowName: data.name,
            nodes: data.version.nodes,
            edges: data.version.edges,
            viewport: data.version.viewport || initialViewport,
            history: {
                past: [],
                present: {
                    nodes: data.version.nodes,
                    edges: data.version.edges,
                    viewport: data.version.viewport || initialViewport,
                },
                future: [],
            },
        });
    },

    exportJSON: () => {
        const { nodes, edges, viewport, workflowName } = get();
        return JSON.stringify({ workflowName, nodes, edges, viewport }, null, 2);
    },

    importJSON: (json) => {
        try {
            const data = JSON.parse(json);
            set({
                workflowName: data.workflowName || 'Imported workflow',
                nodes: data.nodes || [],
                edges: data.edges || [],
                viewport: data.viewport || initialViewport,
                history: {
                    past: [],
                    present: {
                        nodes: data.nodes || [],
                        edges: data.edges || [],
                        viewport: data.viewport || initialViewport,
                    },
                    future: [],
                },
            });
        } catch (error) {
            console.error('Failed to import workflow:', error);
            throw new Error('Invalid workflow JSON');
        }
    },

    resetWorkflow: () => {
        set({
            workflowId: null,
            workflowName: 'Untitled workflow',
            nodes: [],
            edges: [],
            viewport: initialViewport,
            history: initialHistoryState,
        });
    },
}));
