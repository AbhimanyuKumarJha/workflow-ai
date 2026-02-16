'use client';

import { useState } from 'react';
import {
    Type,
    ImagePlus,
    Video,
    Brain,
    Crop,
    Scissors,
    Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/stores/ui-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { CustomNodeData } from '@/lib/types';

interface NodeTypeButton {
    type: string;
    label: string;
    icon: React.ElementType;
    description: string;
}

const nodeTypes: NodeTypeButton[] = [
    {
        type: 'text',
        label: 'Text Node',
        icon: Type,
        description: 'Static text input',
    },
    {
        type: 'upload_image',
        label: 'Upload Image',
        icon: ImagePlus,
        description: 'Upload and process images',
    },
    {
        type: 'upload_video',
        label: 'Upload Video',
        icon: Video,
        description: 'Upload and process videos',
    },
    {
        type: 'llm',
        label: 'Run Any LLM',
        icon: Brain,
        description: 'Execute LLM with Google Gemini',
    },
    {
        type: 'crop_image',
        label: 'Crop Image',
        icon: Crop,
        description: 'Crop image with coordinates',
    },
    {
        type: 'extract_frame',
        label: 'Extract Frame',
        icon: Scissors,
        description: 'Extract frame from video',
    },
];

export function LeftSidebar() {
    const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
    const addNode = useWorkflowStore((state) => state.addNode);
    const viewport = useWorkflowStore((state) => state.viewport);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredNodeTypes = nodeTypes.filter(
        (node) =>
            node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getDefaultNodeData = (type: string): CustomNodeData => {
        switch (type) {
            case 'text':
                return { label: 'Text Node', value: '' };
            case 'upload_image':
                return { label: 'Upload Image' };
            case 'upload_video':
                return { label: 'Upload Video' };
            case 'llm':
                return {
                    label: 'Run Any LLM',
                    selectedModel: 'gemini-2.0-flash-exp',
                    systemPrompt: '',
                    userMessage: '',
                };
            case 'crop_image':
                return {
                    label: 'Crop Image',
                    xPercent: 0,
                    yPercent: 0,
                    widthPercent: 100,
                    heightPercent: 100,
                };
            case 'extract_frame':
                return {
                    label: 'Extract Frame',
                    timestamp: 0,
                };
            default:
                return { label: 'Unknown Node' };
        }
    };

    const handleClickAdd = (nodeType: string) => {
        // Calculate center of the visible canvas area using current viewport
        const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
        const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;

        // Add some random jitter so nodes don't stack exactly on top of each other
        const jitterX = (Math.random() - 0.5) * 100;
        const jitterY = (Math.random() - 0.5) * 100;

        const data = getDefaultNodeData(nodeType);
        addNode(nodeType, { x: centerX + jitterX, y: centerY + jitterY }, data);
        toast.success(`Added ${data.label}`);
    };

    const handleDragStart = (
        event: React.DragEvent<HTMLDivElement>,
        nodeType: string
    ) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    if (!leftSidebarOpen) {
        // Collapsed icon rail
        return (
            <aside className="w-14 border-r border-gray-800 bg-gray-900 flex flex-col items-center py-4 gap-2">
                <h3 className="sr-only">Quick Access</h3>
                {nodeTypes.map((node) => {
                    const Icon = node.icon;
                    return (
                        <button
                            key={node.type}
                            onClick={() => handleClickAdd(node.type)}
                            className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors group relative"
                            title={node.label}
                        >
                            <Icon size={18} className="text-gray-300 group-hover:text-white" />
                        </button>
                    );
                })}
            </aside>
        );
    }

    return (
        <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col">
            {/* Search bar */}
            <div className="p-4 border-b border-gray-800">
                <div className="relative">
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        size={16}
                    />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                </div>
            </div>

            {/* Quick Access Section */}
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Quick Access
                </h3>

                <div className="space-y-2">
                    {filteredNodeTypes.map((node) => {
                        const Icon = node.icon;
                        return (
                            <div
                                key={node.type}
                                draggable
                                onDragStart={(e) => handleDragStart(e, node.type)}
                                onClick={() => handleClickAdd(node.type)}
                                className="flex items-start gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-grab active:cursor-grabbing transition-colors group"
                            >
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Icon size={20} className="text-white" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white truncate">
                                        {node.label}
                                    </h4>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {node.description}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {filteredNodeTypes.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                        <p className="text-sm">No nodes found</p>
                        <p className="text-xs mt-1">Try a different search term</p>
                    </div>
                )}
            </div>

            {/* Help section */}
            <div className="p-4 border-t border-gray-800">
                <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400">
                        <span className="font-semibold text-purple-400">Tip:</span> Click or
                        drag and drop nodes onto the canvas to build your workflow.
                    </p>
                </div>
            </div>
        </aside>
    );
}
