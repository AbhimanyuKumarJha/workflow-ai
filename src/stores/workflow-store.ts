import { create } from 'zustand';
import {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    Viewport,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
} from '@xyflow/react';
import { CustomNodeData, WorkflowSnapshot } from '@/lib/types';
import { getHandleDataType } from '@/lib/handle-registry';

interface HistoryState {
    past: WorkflowSnapshot[];
    present: WorkflowSnapshot;
    future: WorkflowSnapshot[];
}

interface ApplySnapshotOptions {
    name?: string;
    description?: string;
    markDirty?: boolean;
}

interface NodeRunOutputPatch {
    nodeId: string;
    status?: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    outputs?: Record<string, unknown> | null;
    errorMessage?: string | null;
}

interface WorkflowState {
    workflowId: string | null;
    workflowName: string;
    workflowDescription: string;
    nodes: Node<CustomNodeData>[];
    edges: Edge[];
    viewport: Viewport;

    history: HistoryState;
    isDirty: boolean;
    isSaving: boolean;
    lastSavedAt: string | null;

    setWorkflowId: (id: string | null) => void;
    setWorkflowName: (name: string) => void;
    setWorkflowDescription: (description: string) => void;
    setNodes: (nodes: Node<CustomNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    setViewport: (viewport: Viewport) => void;

    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;

    addNode: (type: string, position: { x: number; y: number }, data: CustomNodeData) => void;
    deleteNode: (id: string) => void;
    updateNodeData: (id: string, data: Partial<CustomNodeData>) => void;

    undo: () => void;
    redo: () => void;
    addToHistory: () => void;

    saveWorkflow: () => Promise<void>;
    loadWorkflow: (id: string) => Promise<void>;
    exportJSON: () => string;
    importJSON: (json: string) => void;
    applySnapshot: (snapshot: WorkflowSnapshot, options?: ApplySnapshotOptions) => void;
    applyNodeRunOutputs: (nodeRuns: NodeRunOutputPatch[]) => void;
    resetWorkflow: () => void;
}

const HISTORY_DEBOUNCE_MS = 250;
let historyTimeout: ReturnType<typeof setTimeout> | null = null;

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 };

const initialSnapshot: WorkflowSnapshot = {
    nodes: [],
    edges: [],
    viewport: initialViewport,
};

const initialHistory: HistoryState = {
    past: [],
    present: initialSnapshot,
    future: [],
};

function deepClone<T>(value: T): T {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function getSnapshotFromState(state: Pick<WorkflowState, 'nodes' | 'edges' | 'viewport'>): WorkflowSnapshot {
    return deepClone({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
    });
}

function snapshotsEqual(a: WorkflowSnapshot, b: WorkflowSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function generateNodeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `node-${crypto.randomUUID()}`;
    }

    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toStringValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function toNumberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    workflowId: null,
    workflowName: 'Untitled workflow',
    workflowDescription: '',
    nodes: [],
    edges: [],
    viewport: initialViewport,

    history: initialHistory,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,

    setWorkflowId: (id) => set({ workflowId: id }),

    setWorkflowName: (name) => {
        set({ workflowName: name, isDirty: true });
    },

    setWorkflowDescription: (description) => {
        set({ workflowDescription: description, isDirty: true });
    },

    setNodes: (nodes) => {
        set({ nodes, isDirty: true });
        get().addToHistory();
    },

    setEdges: (edges) => {
        set({ edges, isDirty: true });
        get().addToHistory();
    },

    setViewport: (viewport) => {
        set({ viewport });
    },

    onNodesChange: (changes) => {
        set((state) => ({
            nodes: applyNodeChanges(changes, state.nodes) as Node<CustomNodeData>[],
            isDirty: true,
        }));
        get().addToHistory();
    },

    onEdgesChange: (changes) => {
        set((state) => ({
            edges: applyEdgeChanges(changes, state.edges),
            isDirty: true,
        }));
        get().addToHistory();
    },

    onConnect: (connection) => {
        const { nodes } = get();
        const sourceNode = nodes.find((node) => node.id === connection.source);
        const dataType = sourceNode
            ? getHandleDataType(sourceNode.type ?? '', connection.sourceHandle ?? '')
            : undefined;

        set((state) => ({
            edges: addEdge(
                {
                    ...connection,
                    id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type: 'custom',
                    data: { dataType },
                },
                state.edges
            ),
            isDirty: true,
        }));

        get().addToHistory();
    },

    addNode: (type, position, data) => {
        const node: Node<CustomNodeData> = {
            id: generateNodeId(),
            type,
            position,
            data,
        };

        set((state) => ({
            nodes: [...state.nodes, node],
            isDirty: true,
        }));

        get().addToHistory();
    },

    deleteNode: (id) => {
        set((state) => ({
            nodes: state.nodes.filter((node) => node.id !== id),
            edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
            isDirty: true,
        }));

        get().addToHistory();
    },

    updateNodeData: (id, data) => {
        set((state) => ({
            nodes: state.nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
            isDirty: true,
        }));

        get().addToHistory();
    },

    undo: () => {
        const { history } = get();
        if (history.past.length === 0) {
            return;
        }

        const previous = history.past[history.past.length - 1];
        const nextPast = history.past.slice(0, -1);

        set({
            nodes: deepClone(previous.nodes),
            edges: deepClone(previous.edges),
            viewport: deepClone(previous.viewport),
            history: {
                past: nextPast,
                present: deepClone(previous),
                future: [deepClone(history.present), ...history.future],
            },
            isDirty: true,
        });
    },

    redo: () => {
        const { history } = get();
        if (history.future.length === 0) {
            return;
        }

        const [next, ...remainingFuture] = history.future;

        set({
            nodes: deepClone(next.nodes),
            edges: deepClone(next.edges),
            viewport: deepClone(next.viewport),
            history: {
                past: [...history.past, deepClone(history.present)],
                present: deepClone(next),
                future: remainingFuture,
            },
            isDirty: true,
        });
    },

    addToHistory: () => {
        if (historyTimeout) {
            clearTimeout(historyTimeout);
        }

        historyTimeout = setTimeout(() => {
            const state = get();
            const nextSnapshot = getSnapshotFromState(state);

            if (snapshotsEqual(nextSnapshot, state.history.present)) {
                historyTimeout = null;
                return;
            }

            set({
                history: {
                    past: [...state.history.past, deepClone(state.history.present)],
                    present: nextSnapshot,
                    future: [],
                },
            });

            historyTimeout = null;
        }, HISTORY_DEBOUNCE_MS);
    },

    saveWorkflow: async () => {
        const {
            workflowId,
            workflowName,
            workflowDescription,
            nodes,
            edges,
            viewport,
        } = get();

        set({ isSaving: true });

        try {
            const payload = {
                name: workflowName,
                description: workflowDescription || undefined,
                nodes,
                edges,
                viewport,
            };

            let response: Response;
            if (workflowId) {
                response = await fetch(`/api/workflows/${workflowId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await fetch('/api/workflows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: workflowName,
                        description: workflowDescription || undefined,
                        snapshot: {
                            nodes,
                            edges,
                            viewport,
                        },
                    }),
                });
            }

            if (!response.ok) {
                const errorPayload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(errorPayload?.error ?? 'Failed to save workflow');
            }

            const result = (await response.json()) as {
                workflow?: { id?: string };
            };

            const nextWorkflowId = result.workflow?.id ?? workflowId;
            const nextSnapshot = getSnapshotFromState(get());

            set((state) => ({
                workflowId: nextWorkflowId ?? null,
                isDirty: false,
                isSaving: false,
                lastSavedAt: new Date().toISOString(),
                history: {
                    ...state.history,
                    present: nextSnapshot,
                },
            }));
        } catch (error) {
            set({ isSaving: false });
            throw error;
        }
    },

    loadWorkflow: async (id) => {
        const response = await fetch(`/api/workflows/${id}`);

        if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error ?? 'Failed to load workflow');
        }

        const data = (await response.json()) as {
            id: string;
            name: string;
            description: string | null;
            version: {
                nodes: Node<CustomNodeData>[];
                edges: Edge[];
                viewport: Viewport | null;
            };
            updatedAt?: string;
        };

        const snapshot: WorkflowSnapshot = {
            nodes: (data.version.nodes ?? []) as Node<CustomNodeData>[],
            edges: (data.version.edges ?? []) as Edge[],
            viewport: data.version.viewport ?? initialViewport,
        };

        set({
            workflowId: data.id,
            workflowName: data.name,
            workflowDescription: data.description ?? '',
            nodes: deepClone(snapshot.nodes),
            edges: deepClone(snapshot.edges),
            viewport: deepClone(snapshot.viewport),
            history: {
                past: [],
                present: deepClone(snapshot),
                future: [],
            },
            isDirty: false,
            lastSavedAt: data.updatedAt ?? new Date().toISOString(),
        });
    },

    exportJSON: () => {
        const { workflowName, workflowDescription, nodes, edges, viewport } = get();
        return JSON.stringify(
            {
                workflowName,
                workflowDescription,
                nodes,
                edges,
                viewport,
            },
            null,
            2
        );
    },

    importJSON: (json) => {
        let parsed: {
            workflowName?: string;
            workflowDescription?: string;
            nodes?: Node<CustomNodeData>[];
            edges?: Edge[];
            viewport?: Viewport;
        };

        try {
            parsed = JSON.parse(json) as {
                workflowName?: string;
                workflowDescription?: string;
                nodes?: Node<CustomNodeData>[];
                edges?: Edge[];
                viewport?: Viewport;
            };
        } catch {
            throw new Error('Invalid workflow JSON');
        }

        const snapshot: WorkflowSnapshot = {
            nodes: (parsed.nodes ?? []) as Node<CustomNodeData>[],
            edges: (parsed.edges ?? []) as Edge[],
            viewport: parsed.viewport ?? initialViewport,
        };

        set({
            workflowName: parsed.workflowName?.trim() || 'Imported workflow',
            workflowDescription: parsed.workflowDescription?.trim() || '',
            nodes: deepClone(snapshot.nodes),
            edges: deepClone(snapshot.edges),
            viewport: deepClone(snapshot.viewport),
            history: {
                past: [],
                present: deepClone(snapshot),
                future: [],
            },
            isDirty: true,
        });
    },

    applySnapshot: (snapshot, options) => {
        const normalized: WorkflowSnapshot = {
            nodes: deepClone(snapshot.nodes ?? []),
            edges: deepClone(snapshot.edges ?? []),
            viewport: deepClone(snapshot.viewport ?? initialViewport),
        };

        const markDirty = options?.markDirty ?? true;

        set({
            ...(options?.name ? { workflowName: options.name } : {}),
            ...(options?.description !== undefined
                ? { workflowDescription: options.description }
                : {}),
            nodes: normalized.nodes,
            edges: normalized.edges,
            viewport: normalized.viewport,
            history: {
                past: [],
                present: deepClone(normalized),
                future: [],
            },
            isDirty: markDirty,
        });
    },

    applyNodeRunOutputs: (nodeRuns) => {
        if (!Array.isArray(nodeRuns) || nodeRuns.length === 0) {
            return;
        }

        const byNodeId = new Map(nodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun]));

        set((state) => ({
            nodes: state.nodes.map((node) => {
                const nodeRun = byNodeId.get(node.id);
                if (!nodeRun) {
                    return node;
                }

                const outputs = nodeRun.outputs ?? {};
                const error = nodeRun.errorMessage ?? undefined;
                const basePatch: Partial<CustomNodeData> = {
                    isExecuting: nodeRun.status === 'RUNNING',
                    error,
                };

                switch (node.type) {
                    case 'text':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                value:
                                    toStringValue(outputs.value) ??
                                    toStringValue(outputs.text) ??
                                    toStringValue(node.data.value) ??
                                    '',
                            },
                        };
                    case 'upload_image':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                imageUrl:
                                    toStringValue(outputs.imageUrl) ??
                                    toStringValue(outputs.url) ??
                                    toStringValue(node.data.imageUrl),
                                assetId:
                                    toStringValue(outputs.assetId) ??
                                    toStringValue(node.data.assetId),
                                mimeType:
                                    toStringValue(outputs.mimeType) ??
                                    toStringValue(node.data.mimeType),
                                width:
                                    toNumberValue(outputs.width) ??
                                    toNumberValue(node.data.width),
                                height:
                                    toNumberValue(outputs.height) ??
                                    toNumberValue(node.data.height),
                            },
                        };
                    case 'upload_video':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                videoUrl:
                                    toStringValue(outputs.videoUrl) ??
                                    toStringValue(outputs.url) ??
                                    toStringValue(node.data.videoUrl),
                                assetId:
                                    toStringValue(outputs.assetId) ??
                                    toStringValue(node.data.assetId),
                                mimeType:
                                    toStringValue(outputs.mimeType) ??
                                    toStringValue(node.data.mimeType),
                                durationMs:
                                    toNumberValue(outputs.durationMs) ??
                                    toNumberValue(node.data.durationMs),
                            },
                        };
                    case 'llm':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                response:
                                    toStringValue(outputs.text) ??
                                    toStringValue(outputs.response) ??
                                    toStringValue(node.data.response),
                            },
                        };
                    case 'crop_image':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                croppedUrl:
                                    toStringValue(outputs.croppedUrl) ??
                                    toStringValue(outputs.imageUrl) ??
                                    toStringValue(node.data.croppedUrl),
                            },
                        };
                    case 'extract_frame':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                extractedFrameUrl:
                                    toStringValue(outputs.frameUrl) ??
                                    toStringValue(outputs.extractedFrameUrl) ??
                                    toStringValue(node.data.extractedFrameUrl),
                            },
                        };
                    case 'generate_image':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                prompt:
                                    toStringValue(outputs.prompt) ??
                                    toStringValue(node.data.prompt),
                                model:
                                    toStringValue(outputs.model) ??
                                    toStringValue(node.data.model),
                                imageUrl:
                                    toStringValue(outputs.imageUrl) ??
                                    toStringValue(outputs.url) ??
                                    toStringValue(node.data.imageUrl),
                                assetId:
                                    toStringValue(outputs.assetId) ??
                                    toStringValue(node.data.assetId),
                                publicId:
                                    toStringValue(outputs.publicId) ??
                                    toStringValue(node.data.publicId),
                                provider:
                                    toStringValue(outputs.provider) ??
                                    toStringValue(node.data.provider),
                                mimeType:
                                    toStringValue(outputs.mimeType) ??
                                    toStringValue(node.data.mimeType),
                                bytes:
                                    toNumberValue(outputs.bytes) ??
                                    toNumberValue(node.data.bytes),
                                width:
                                    toNumberValue(outputs.width) ??
                                    toNumberValue(node.data.width),
                                height:
                                    toNumberValue(outputs.height) ??
                                    toNumberValue(node.data.height),
                            },
                        };
                    case 'export_text':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                text:
                                    toStringValue(outputs.text) ??
                                    toStringValue(outputs.value) ??
                                    toStringValue(node.data.text) ??
                                    toStringValue(node.data.value),
                                value:
                                    toStringValue(outputs.value) ??
                                    toStringValue(outputs.text) ??
                                    toStringValue(node.data.value) ??
                                    toStringValue(node.data.text),
                                format:
                                    toStringValue(outputs.format) === 'txt'
                                        ? 'txt'
                                        : (node.data.format as 'txt' | undefined),
                            },
                        };
                    case 'export_image':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                imageUrl:
                                    toStringValue(outputs.imageUrl) ??
                                    toStringValue(outputs.url) ??
                                    toStringValue(node.data.imageUrl),
                                assetId:
                                    toStringValue(outputs.assetId) ??
                                    toStringValue(node.data.assetId),
                                publicId:
                                    toStringValue(outputs.publicId) ??
                                    toStringValue(node.data.publicId),
                                provider:
                                    toStringValue(outputs.provider) ??
                                    toStringValue(node.data.provider),
                                mimeType:
                                    toStringValue(outputs.mimeType) ??
                                    toStringValue(node.data.mimeType),
                                bytes:
                                    toNumberValue(outputs.bytes) ??
                                    toNumberValue(node.data.bytes),
                                width:
                                    toNumberValue(outputs.width) ??
                                    toNumberValue(node.data.width),
                                height:
                                    toNumberValue(outputs.height) ??
                                    toNumberValue(node.data.height),
                            },
                        };
                    case 'export_video':
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                                videoUrl:
                                    toStringValue(outputs.videoUrl) ??
                                    toStringValue(outputs.url) ??
                                    toStringValue(node.data.videoUrl),
                                assetId:
                                    toStringValue(outputs.assetId) ??
                                    toStringValue(node.data.assetId),
                                publicId:
                                    toStringValue(outputs.publicId) ??
                                    toStringValue(node.data.publicId),
                                provider:
                                    toStringValue(outputs.provider) ??
                                    toStringValue(node.data.provider),
                                mimeType:
                                    toStringValue(outputs.mimeType) ??
                                    toStringValue(node.data.mimeType),
                                bytes:
                                    toNumberValue(outputs.bytes) ??
                                    toNumberValue(node.data.bytes),
                                width:
                                    toNumberValue(outputs.width) ??
                                    toNumberValue(node.data.width),
                                height:
                                    toNumberValue(outputs.height) ??
                                    toNumberValue(node.data.height),
                                durationMs:
                                    toNumberValue(outputs.durationMs) ??
                                    toNumberValue(node.data.durationMs),
                            },
                        };
                    default:
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                ...basePatch,
                            },
                        };
                }
            }),
        }));
    },

    resetWorkflow: () => {
        set({
            workflowId: null,
            workflowName: 'Untitled workflow',
            workflowDescription: '',
            nodes: [],
            edges: [],
            viewport: initialViewport,
            history: initialHistory,
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,
        });
    },
}));

