'use client';

import { UserButton } from '@clerk/nextjs';
import { Save, Download, Upload, Play, PanelLeftClose, PanelRightClose } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { toast } from 'sonner';
import { useState } from 'react';

export function Header() {
    const workflowName = useWorkflowStore((state) => state.workflowName);
    const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const exportJSON = useWorkflowStore((state) => state.exportJSON);
    const importJSON = useWorkflowStore((state) => state.importJSON);
    const nodes = useWorkflowStore((state) => state.nodes);

    const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);
    const toggleLeftSidebar = useUIStore((state) => state.toggleLeftSidebar);
    const toggleRightSidebar = useUIStore((state) => state.toggleRightSidebar);

    const [isEditingName, setIsEditingName] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveWorkflow();
            toast.success('Workflow saved successfully');
        } catch (error) {
            toast.error('Failed to save workflow');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        try {
            const json = exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${workflowName}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Workflow exported successfully');
        } catch (error) {
            toast.error('Failed to export workflow');
            console.error(error);
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                importJSON(text);
                toast.success('Workflow imported successfully');
            } catch (error) {
                toast.error('Failed to import workflow');
                console.error(error);
            }
        };
        input.click();
    };

    const handleExecute = async () => {
        if (nodes.length === 0) {
            toast.error('No nodes to execute');
            return;
        }

        toast.info('Workflow execution coming in Phase 5');
    };

    return (
        <header className="h-16 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4">
            {/* Left section - Logo and Workflow Name */}
            <div className="flex items-center gap-4">
                {/* Toggle Left Sidebar */}
                <button
                    onClick={toggleLeftSidebar}
                    className="p-2 hover:bg-gray-800 rounded transition-colors"
                    title={leftSidebarOpen ? 'Close left sidebar' : 'Open left sidebar'}
                >
                    <PanelLeftClose
                        size={20}
                        className={`transition-transform ${!leftSidebarOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">W</span>
                    </div>
                    <span className="text-xl font-bold text-white hidden sm:block">
                        Weavy
                    </span>
                </div>

                {/* Workflow Name */}
                <div className="ml-4">
                    {isEditingName ? (
                        <input
                            type="text"
                            value={workflowName}
                            onChange={(e) => setWorkflowName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setIsEditingName(false);
                                if (e.key === 'Escape') setIsEditingName(false);
                            }}
                            autoFocus
                            className="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700 focus:outline-none focus:border-purple-500"
                        />
                    ) : (
                        <button
                            onClick={() => setIsEditingName(true)}
                            className="text-white hover:text-purple-400 transition-colors px-3 py-1 hover:bg-gray-800 rounded"
                        >
                            {workflowName}
                        </button>
                    )}
                </div>
            </div>

            {/* Center section - Action buttons */}
            <div className="flex items-center gap-2">
                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                    title="Save workflow (Ctrl+S)"
                >
                    <Save size={16} />
                    <span className="hidden sm:inline">
                        {isSaving ? 'Saving...' : 'Save'}
                    </span>
                </button>

                {/* Export Button */}
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    title="Export workflow (Ctrl+E)"
                >
                    <Download size={16} />
                    <span className="hidden sm:inline">Export</span>
                </button>

                {/* Import Button */}
                <button
                    onClick={handleImport}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    title="Import workflow"
                >
                    <Upload size={16} />
                    <span className="hidden sm:inline">Import</span>
                </button>

                {/* Execute Button */}
                <button
                    onClick={handleExecute}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    title="Execute workflow"
                >
                    <Play size={16} />
                    <span className="hidden sm:inline">Run</span>
                </button>
            </div>

            {/* Right section - User button and toggle */}
            <div className="flex items-center gap-2">
                <UserButton
                    appearance={{
                        elements: {
                            avatarBox: 'w-8 h-8',
                        },
                    }}
                />

                {/* Toggle Right Sidebar */}
                <button
                    onClick={toggleRightSidebar}
                    className="p-2 hover:bg-gray-800 rounded transition-colors"
                    title={rightSidebarOpen ? 'Close right sidebar' : 'Open right sidebar'}
                >
                    <PanelRightClose
                        size={20}
                        className={`transition-transform ${!rightSidebarOpen ? 'rotate-180' : ''}`}
                    />
                </button>
            </div>
        </header>
    );
}
