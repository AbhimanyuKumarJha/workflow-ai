'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { WorkflowCanvas } from '@/components/canvas/WorkflowCanvas';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { useHistoryStore } from '@/stores/history-store';
import { useExecutionStatus } from '@/hooks/useExecutionStatus';
import { CustomNode } from '@/lib/types';

interface ResolveMediaResponse {
    assemblyId: string;
    url: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    mimeType?: string;
    outputType?: string;
    isTempUrl?: boolean;
    sourceStep?: string;
}

function inferMediaFromUrl(url: string): 'image' | 'video' | undefined {
    const lower = url.toLowerCase();
    if (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.avif')
    ) {
        return 'image';
    }
    if (
        lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.m4v') ||
        lower.endsWith('.avi') ||
        lower.endsWith('.mkv')
    ) {
        return 'video';
    }
    return undefined;
}

function isExpectedMedia(uploadType: 'image' | 'video', mimeType?: string, url?: string): boolean {
    const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
    const inferred = typeof url === 'string' ? inferMediaFromUrl(url) : undefined;

    if (uploadType === 'image') {
        return normalizedMime.startsWith('image/') || inferred === 'image';
    }

    return normalizedMime.startsWith('video/') || inferred === 'video';
}

export default function WorkflowEditorPage() {
    const params = useParams<{ id: string }>();
    const routeId = params?.id as string;

    const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
    const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow);

    const setLeftSidebarOpen = useUIStore((state) => state.setLeftSidebarOpen);
    const setRightSidebarOpen = useUIStore((state) => state.setRightSidebarOpen);

    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const clearRuns = useHistoryStore((state) => state.clearRuns);
    const activeRunId = useHistoryStore((state) => state.activeRunId);

    useExecutionStatus(activeRunId);

    // Auto-collapse sidebars on small screens
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setLeftSidebarOpen(false);
                setRightSidebarOpen(false);
            }
        };

        handleResize(); // Check on mount
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setLeftSidebarOpen, setRightSidebarOpen]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!routeId || routeId === 'new') {
                resetWorkflow();
                clearRuns();
                return;
            }

            try {
                await loadWorkflow(routeId);
                if (cancelled) {
                    return;
                }

                const state = useWorkflowStore.getState();
                const uploadNodes = state.nodes.filter((node) => {
                    if (node.type !== 'upload_image' && node.type !== 'upload_video') {
                        return false;
                    }
                    const assemblyId = node.data?.assemblyId;
                    return typeof assemblyId === 'string' && assemblyId.length > 0;
                }) as CustomNode[];

                let recoveredCount = 0;

                for (const node of uploadNodes) {
                    const assemblyId = node.data.assemblyId as string;
                    const uploadType = node.type === 'upload_video' ? 'video' : 'image';
                    const currentUrl =
                        uploadType === 'video'
                            ? (node.data.videoUrl as string | undefined)
                            : (node.data.imageUrl as string | undefined);
                    const currentMime = node.data.mimeType as string | undefined;

                    try {
                        const response = await fetch(
                            `/api/transloadit/resolve?assemblyId=${encodeURIComponent(assemblyId)}&type=${uploadType}`,
                            {
                                method: 'GET',
                                cache: 'no-store',
                            }
                        );

                        const payload = (await response.json().catch(() => null)) as
                            | ResolveMediaResponse
                            | { code?: string; message?: string; error?: string }
                            | null;

                        if (!response.ok) {
                            const payloadCode =
                                payload &&
                                typeof payload === 'object' &&
                                'code' in payload &&
                                typeof payload.code === 'string'
                                    ? payload.code
                                    : undefined;

                            if (
                                response.status === 422 &&
                                typeof payloadCode === 'string'
                            ) {
                                state.updateNodeData(node.id, {
                                    error:
                                        uploadType === 'video'
                                            ? 'Stored assembly output is not a video. Fix Transloadit video template.'
                                            : 'Stored assembly output is not an image. Fix Transloadit image template.',
                                });
                            } else {
                                const errorMessage =
                                    payload &&
                                    typeof payload === 'object' &&
                                    'error' in payload &&
                                    typeof payload.error === 'string'
                                        ? payload.error
                                        : payload &&
                                            typeof payload === 'object' &&
                                            'message' in payload &&
                                            typeof payload.message === 'string'
                                        ? payload.message
                                        : undefined;

                                if (errorMessage) {
                                    state.updateNodeData(node.id, { error: errorMessage });
                                }
                            }
                            continue;
                        }

                        if (!payload || typeof payload !== 'object' || !('url' in payload)) {
                            continue;
                        }

                        const shouldUpdate =
                            currentUrl !== payload.url ||
                            currentMime !== payload.mimeType ||
                            !isExpectedMedia(uploadType, currentMime, currentUrl);

                        if (!shouldUpdate) {
                            continue;
                        }

                        if (uploadType === 'video') {
                            state.updateNodeData(node.id, {
                                videoUrl: payload.url,
                                assetId: payload.assetId,
                                publicId: payload.publicId,
                                provider: payload.provider,
                                mimeType: payload.mimeType ?? 'video/mp4',
                                outputType: payload.outputType,
                                sourceStep: payload.sourceStep,
                                isTempUrl: payload.isTempUrl,
                                assemblyId: payload.assemblyId,
                                error: undefined,
                            });
                        } else {
                            state.updateNodeData(node.id, {
                                imageUrl: payload.url,
                                assetId: payload.assetId,
                                publicId: payload.publicId,
                                provider: payload.provider,
                                mimeType: payload.mimeType ?? 'image/jpeg',
                                outputType: payload.outputType,
                                sourceStep: payload.sourceStep,
                                isTempUrl: payload.isTempUrl,
                                assemblyId: payload.assemblyId,
                                error: undefined,
                            });
                        }

                        recoveredCount += 1;
                    } catch {
                        continue;
                    }
                }

                if (recoveredCount > 0) {
                    await state.saveWorkflow();
                    toast.success(
                        recoveredCount === 1
                            ? 'Recovered 1 stale uploaded asset'
                            : `Recovered ${recoveredCount} stale uploaded assets`
                    );
                }

                if (!cancelled) {
                    await fetchHistory(routeId);
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(error instanceof Error ? error.message : 'Failed to load workflow');
                }
            }
        };

        load().catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [routeId, loadWorkflow, resetWorkflow, fetchHistory, clearRuns]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const state = useWorkflowStore.getState();
            if (!state.workflowId || state.isSaving || !state.isDirty) {
                return;
            }

            state.saveWorkflow().catch(() => undefined);
        }, 30_000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="h-full flex overflow-hidden">
            <LeftSidebar />

            <main className="flex-1 relative min-w-0">
                <WorkflowCanvas />
            </main>

            <RightSidebar />
        </div>
    );
}
