'use client';

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Connection,
    ReactFlowProvider,
    useReactFlow,
    Panel,
    Edge,
    Node,
    EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { CustomEdge } from './CustomEdge';
import { CustomNodeData } from '@/lib/types';
import { toast } from 'sonner';
import { nodeTypes } from '@/components/nodes';
import { areHandlesCompatible, getDataTypeLabel, getHandleDataType } from '@/lib/handle-registry';
import { Maximize2 } from 'lucide-react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function WorkflowCanvasInner() {
    const reactFlowInstance = useReactFlow();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [hasInitialized, setHasInitialized] = useState(false);

    // Workflow store
    const nodes = useWorkflowStore((state) => state.nodes);
    const edges = useWorkflowStore((state) => state.edges);
    const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
    const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
    const onConnect = useWorkflowStore((state) => state.onConnect);
    const addNode = useWorkflowStore((state) => state.addNode);
    const deleteNode = useWorkflowStore((state) => state.deleteNode);
    const undo = useWorkflowStore((state) => state.undo);
    const redo = useWorkflowStore((state) => state.redo);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const exportJSON = useWorkflowStore((state) => state.exportJSON);
    const setViewport = useWorkflowStore((state) => state.setViewport);
    const viewport = useWorkflowStore((state) => state.viewport);

    // UI store
    const clearSelection = useUIStore((state) => state.clearSelection);

    // Node types - imported from components/nodes
    const memoizedNodeTypes = useMemo(() => nodeTypes, []);

    // Edge types
    const edgeTypes = useMemo<EdgeTypes>(() => ({ custom: CustomEdge }), []);

    // Get default node data based on type
    const getDefaultNodeData = useCallback((type: string): CustomNodeData => {
        const baseData = { label: '' };

        switch (type) {
            case 'text':
                return { ...baseData, label: 'Text Node', value: '' };
            case 'upload_image':
                return { ...baseData, label: 'Upload Image' };
            case 'upload_video':
                return { ...baseData, label: 'Upload Video' };
            case 'llm':
                return {
                    ...baseData,
                    label: 'Run Any LLM',
                    selectedModel: 'gemini-2.0-flash-exp',
                    systemPrompt: '',
                    userMessage: '',
                };
            case 'crop_image':
                return {
                    ...baseData,
                    label: 'Crop Image',
                    xPercent: 0,
                    yPercent: 0,
                    widthPercent: 100,
                    heightPercent: 100,
                };
            case 'extract_frame':
                return {
                    ...baseData,
                    label: 'Extract Frame',
                    timestamp: 0,
                };
            case 'generate_image':
                return {
                    ...baseData,
                    label: 'Generate Image',
                    prompt: '',
                    model: 'gemini-2.0-flash-exp',
                };
            case 'export_text':
                return { ...baseData, label: 'Export Text' };
            case 'export_image':
                return { ...baseData, label: 'Export Image' };
            case 'export_video':
                return { ...baseData, label: 'Export Video' };
            default:
                return { ...baseData, label: 'Unknown Node' };
        }
    }, []);

    // Drag & Drop handler
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const nodeType = event.dataTransfer.getData('application/reactflow');
            if (!nodeType) return;

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            addNode(nodeType, position, getDefaultNodeData(nodeType));
            toast.success(`Added ${getDefaultNodeData(nodeType).label}`);
        },
        [reactFlowInstance, addNode, getDefaultNodeData]
    );

    const onMoveEnd = useCallback(
        (_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
            setViewport(viewport);
        },
        [setViewport]
    );

    // Connection validation with type checking
    const isValidConnection = useCallback(
        (connection: Connection | Edge) => {
            const conn = connection as Connection;

            // Prevent self-connections
            if (conn.source === conn.target) {
                toast.error('Cannot connect a node to itself');
                return false;
            }

            // Check for duplicate connections
            const existingConnection = edges.find(
                (edge) =>
                    edge.source === conn.source &&
                    edge.target === conn.target &&
                    edge.sourceHandle === conn.sourceHandle &&
                    edge.targetHandle === conn.targetHandle
            );

            if (existingConnection) {
                toast.error('Connection already exists');
                return false;
            }

            // Type compatibility check
            const sourceNode = nodes.find((n) => n.id === conn.source);
            const targetNode = nodes.find((n) => n.id === conn.target);

            if (!sourceNode || !targetNode) {
                return false;
            }

            const compatible = areHandlesCompatible(
                sourceNode.type!,
                conn.sourceHandle || '',
                targetNode.type!,
                conn.targetHandle || ''
            );

            if (!compatible) {
                const sourceType = getHandleDataType(sourceNode.type!, conn.sourceHandle || '');
                const targetType = getHandleDataType(targetNode.type!, conn.targetHandle || '');

                if (sourceType && targetType) {
                    toast.error(
                        `Cannot connect ${getDataTypeLabel(sourceType)} to ${getDataTypeLabel(targetType)}`
                    );
                }
                return false;
            }

            // Basic cycle detection - prevent direct loops
            const wouldCreateCycle = (source: string, target: string): boolean => {
                const visited = new Set<string>();
                const stack = [target];

                while (stack.length > 0) {
                    const current = stack.pop()!;
                    if (current === source) return true;
                    if (visited.has(current)) continue;
                    visited.add(current);

                    edges
                        .filter((e) => e.source === current)
                        .forEach((e) => stack.push(e.target));
                }

                return false;
            };

            if (wouldCreateCycle(conn.source!, conn.target!)) {
                toast.error('Cannot create circular dependencies');
                return false;
            }

            return true;
        },
        [edges, nodes]
    );

    // Delete selected nodes on Delete/Backspace
    const onNodesDelete = useCallback(
        (deleted: Node<CustomNodeData>[]) => {
            deleted.forEach((node) => deleteNode(node.id));
        },
        [deleteNode]
    );

    // Manual center view handler
    const handleCenterView = useCallback(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
        toast.success('Centered view');
    }, [reactFlowInstance]);

    useKeyboardShortcuts({
        'ctrl+s': (event) => {
            event.preventDefault();
            toast.promise(saveWorkflow(), {
                loading: 'Saving workflow...',
                success: 'Workflow saved!',
                error: 'Failed to save workflow',
            });
        },
        'meta+s': (event) => {
            event.preventDefault();
            toast.promise(saveWorkflow(), {
                loading: 'Saving workflow...',
                success: 'Workflow saved!',
                error: 'Failed to save workflow',
            });
        },
        'ctrl+e': (event) => {
            event.preventDefault();
            const json = exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'workflow.json';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success('Workflow exported');
        },
        'meta+e': (event) => {
            event.preventDefault();
            const json = exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'workflow.json';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success('Workflow exported');
        },
        'ctrl+z': (event) => {
            event.preventDefault();
            undo();
            toast.info('Undo');
        },
        'meta+z': (event) => {
            event.preventDefault();
            undo();
            toast.info('Undo');
        },
        'ctrl+y': (event) => {
            event.preventDefault();
            redo();
            toast.info('Redo');
        },
        'meta+shift+z': (event) => {
            event.preventDefault();
            redo();
            toast.info('Redo');
        },
        'ctrl+a': (event) => {
            event.preventDefault();
            reactFlowInstance.setNodes(nodes.map((node) => ({ ...node, selected: true })));
        },
        'meta+a': (event) => {
            event.preventDefault();
            reactFlowInstance.setNodes(nodes.map((node) => ({ ...node, selected: true })));
        },
        escape: () => {
            clearSelection();
            reactFlowInstance.setNodes(nodes.map((node) => ({ ...node, selected: false })));
        },
        'ctrl+0': (event) => {
            event.preventDefault();
            handleCenterView();
        },
        'meta+0': (event) => {
            event.preventDefault();
            handleCenterView();
        },
    });

    // One-time initialization - fit view only when loading a saved workflow
    useEffect(() => {
        if (!hasInitialized && nodes.length > 0) {
            setTimeout(() => {
                const hasStoredViewport =
                    viewport.zoom !== 1 || viewport.x !== 0 || viewport.y !== 0;

                if (hasStoredViewport) {
                    reactFlowInstance.setViewport(viewport, { duration: 0 });
                } else {
                    reactFlowInstance.fitView({ padding: 0.2, duration: 0 });
                }

                setHasInitialized(true);
            }, 50);
        }
    }, [hasInitialized, nodes.length, reactFlowInstance, viewport]);

    return (
        <div ref={reactFlowWrapper} className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodesDelete={onNodesDelete}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onMoveEnd={onMoveEnd}
                isValidConnection={isValidConnection}
                nodeTypes={memoizedNodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{
                    type: 'custom',
                    animated: true,
                }}
                deleteKeyCode={['Backspace', 'Delete']}
                multiSelectionKeyCode="Shift"
                selectionKeyCode="Ctrl"
                panOnScroll
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick={false}
                minZoom={0.1}
                maxZoom={2}
                className="bg-gray-950"
            >
                <Background
                    color="#4b5563"
                    gap={16}
                    size={1}
                />
                <Controls
                    showZoom
                    showFitView
                    showInteractive
                    className="bg-gray-800 border border-gray-700"
                />
                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case 'text':
                                return '#3b82f6';
                            case 'upload_image':
                            case 'upload_video':
                                return '#10b981';
                            case 'llm':
                                return '#8b5cf6';
                            case 'crop_image':
                            case 'extract_frame':
                                return '#f59e0b';
                            case 'generate_image':
                                return '#34d399';
                            case 'export_text':
                                return '#60a5fa';
                            case 'export_image':
                                return '#22c55e';
                            case 'export_video':
                                return '#a855f7';
                            default:
                                return '#6b7280';
                        }
                    }}
                    style={{ backgroundColor: 'rgb(31, 41, 55)', borderColor: 'rgb(55, 65, 81)' }}
                    maskColor="rgba(0, 0, 0, 0.6)"
                />
                {/* Center View Button */}
                <Panel position="top-left" className="m-2">
                    <button
                        onClick={handleCenterView}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg"
                        title="Center and fit all nodes in view (Ctrl+0)"
                    >
                        <Maximize2 className="w-4 h-4" />
                        Center View
                    </button>
                </Panel>
                <Panel position="top-right" className="bg-gray-800 border border-gray-700 rounded-lg p-2 m-2">
                    <div className="text-xs text-gray-400 space-y-1">
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Ctrl+S</kbd>
                            <span>Save</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Ctrl+Z</kbd>
                            <span>Undo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Ctrl+Y</kbd>
                            <span>Redo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Del</kbd>
                            <span>Delete</span>
                        </div>
                    </div>
                </Panel>
            </ReactFlow>
        </div>
    );
}

export function WorkflowCanvas() {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner />
        </ReactFlowProvider>
    );
}
