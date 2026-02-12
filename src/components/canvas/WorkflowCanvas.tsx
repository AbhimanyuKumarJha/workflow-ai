'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { CustomEdge } from './CustomEdge';
import { CustomNodeData } from '@/lib/types';
import { toast } from 'sonner';

// Placeholder node components - will be replaced in Phase 3
function PlaceholderNode({ data }: { data: { label?: string } }) {
    return (
        <div className="px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg min-w-[200px]">
            <div className="text-white font-medium mb-2">{data.label}</div>
            <div className="text-gray-400 text-xs">Phase 3 implementation</div>
        </div>
    );
}

function WorkflowCanvasInner() {
    const reactFlowInstance = useReactFlow();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

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

    // UI store
    const clearSelection = useUIStore((state) => state.clearSelection);

    // Node types - using placeholders for Phase 2
    const nodeTypes = useMemo(
        () => ({
            text: PlaceholderNode,
            upload_image: PlaceholderNode,
            upload_video: PlaceholderNode,
            llm: PlaceholderNode,
            crop_image: PlaceholderNode,
            extract_frame: PlaceholderNode,
        }),
        []
    );

    // Edge types
    const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

    // Get default node data based on type
    const getDefaultNodeData = useCallback((type: string) => {
        const labels: Record<string, string> = {
            text: 'Text Node',
            upload_image: 'Upload Image',
            upload_video: 'Upload Video',
            llm: 'Run Any LLM',
            crop_image: 'Crop Image',
            extract_frame: 'Extract Frame',
        };

        return {
            label: labels[type] || 'Unknown Node',
        };
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

    // Connection validation
    const isValidConnection = useCallback(
        (connection: Connection | Edge) => {
            const conn = connection as Connection;
            // Basic validation - will be enhanced in Phase 3 with type checking
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

            return true;
        },
        [edges]
    );

    // Delete selected nodes on Delete/Backspace
    const onNodesDelete = useCallback(
        (deleted: Node<CustomNodeData>[]) => {
            deleted.forEach((node) => deleteNode(node.id));
        },
        [deleteNode]
    );

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ctrl/Cmd + S: Save
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                toast.promise(saveWorkflow(), {
                    loading: 'Saving workflow...',
                    success: 'Workflow saved!',
                    error: 'Failed to save workflow',
                });
            }

            // Ctrl/Cmd + E: Export
            if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
                event.preventDefault();
                const json = exportJSON();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'workflow.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success('Workflow exported');
            }

            // Ctrl/Cmd + Z: Undo
            if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
                toast.info('Undo');
            }

            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
            if (
                (event.ctrlKey || event.metaKey) &&
                (event.key === 'y' || (event.key === 'z' && event.shiftKey))
            ) {
                event.preventDefault();
                redo();
                toast.info('Redo');
            }

            // Ctrl/Cmd + A: Select all nodes
            if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
                event.preventDefault();
                reactFlowInstance.setNodes(
                    nodes.map((node) => ({ ...node, selected: true }))
                );
            }

            // Escape: Clear selection
            if (event.key === 'Escape') {
                clearSelection();
                reactFlowInstance.setNodes(
                    nodes.map((node) => ({ ...node, selected: false }))
                );
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [
        saveWorkflow,
        exportJSON,
        undo,
        redo,
        clearSelection,
        nodes,
        reactFlowInstance,
    ]);

    // Fit view on mount
    useEffect(() => {
        if (nodes.length > 0) {
            setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.2, duration: 500 });
            }, 100);
        }
    }, [nodes.length, reactFlowInstance]);

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
                isValidConnection={isValidConnection}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
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
                            default:
                                return '#6b7280';
                        }
                    }}
                    className="!bg-gray-800 !border-gray-700"
                    maskColor="rgba(0, 0, 0, 0.6)"
                />
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
