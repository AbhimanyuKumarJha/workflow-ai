import { NodeType, Prisma } from '@prisma/client';
import { runs, tasks } from '@trigger.dev/sdk/v3';
import { prisma } from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { persistDurableAssetFromUrl } from '@/lib/assets';
import { CustomEdge, CustomNode } from '@/lib/types';
import {
    getExecutionLevels,
    getSubgraphForScope,
    resolveNodeInputs,
    validateDAG,
} from '@/lib/dag';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { ExecuteRequestSchema } from '@/lib/validations';

interface NodeExecutionOutcome {
    outputs: Record<string, unknown>;
    taskName?: string;
    triggerRunId?: string;
}

const DEFAULT_WORKFLOW_TASK_TIMEOUT_MS = 120_000;
const IS_DEV = process.env.NODE_ENV === 'development';

function devLog(message: string, details?: Record<string, unknown>) {
    if (!IS_DEV) {
        return;
    }

    if (details) {
        console.log(`[workflow-execute] ${message}`, details);
        return;
    }

    console.log(`[workflow-execute] ${message}`);
}

function getWorkflowTaskTimeoutMs(): number {
    const raw = process.env.WORKFLOW_TASK_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;

    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }

    return DEFAULT_WORKFLOW_TASK_TIMEOUT_MS;
}

function toStringValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return undefined;
}

function toNumberValue(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
}

function toPrismaNodeType(nodeType: string): NodeType {
    const mapping: Record<string, NodeType> = {
        text: NodeType.TEXT,
        upload_image: NodeType.UPLOAD_IMAGE,
        upload_video: NodeType.UPLOAD_VIDEO,
        llm: NodeType.LLM,
        crop_image: NodeType.CROP_IMAGE,
        extract_frame: NodeType.EXTRACT_FRAME,
        generate_image: NodeType.GENERATE_IMAGE,
        export_text: NodeType.EXPORT_TEXT,
        export_image: NodeType.EXPORT_IMAGE,
        export_video: NodeType.EXPORT_VIDEO,
    };

    const result = mapping[nodeType];
    if (!result) {
        throw new WorkflowError(`Unsupported node type: ${nodeType}`, 'INVALID_NODE_TYPE', 400);
    }

    return result;
}

function inferMediaFromUrl(url: string): 'image' | 'video' | undefined {
    const lower = url.toLowerCase();
    if (lower.startsWith('data:image/')) {
        return 'image';
    }
    if (lower.startsWith('data:video/')) {
        return 'video';
    }
    const normalized = lower.split('?')[0].split('#')[0];

    if (
        normalized.endsWith('.jpg') ||
        normalized.endsWith('.jpeg') ||
        normalized.endsWith('.png') ||
        normalized.endsWith('.webp') ||
        normalized.endsWith('.gif') ||
        normalized.endsWith('.avif')
    ) {
        return 'image';
    }

    if (
        normalized.endsWith('.mp4') ||
        normalized.endsWith('.mov') ||
        normalized.endsWith('.webm') ||
        normalized.endsWith('.m4v') ||
        normalized.endsWith('.avi') ||
        normalized.endsWith('.mkv')
    ) {
        return 'video';
    }

    return undefined;
}

function isExpectedMedia(uploadType: 'image' | 'video', input: { mimeType?: string; url?: string }): boolean {
    const normalizedMime = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase() : '';
    const inferred = typeof input.url === 'string' ? inferMediaFromUrl(input.url) : undefined;

    if (uploadType === 'image') {
        return normalizedMime.startsWith('image/') || inferred === 'image';
    }

    return normalizedMime.startsWith('video/') || inferred === 'video';
}

async function withTaskTimeout<T>(taskName: string, taskPromise: Promise<T>): Promise<T> {
    const timeoutMs = getWorkflowTaskTimeoutMs();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            taskPromise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(
                        new WorkflowError(
                            `Task "${taskName}" timed out after ${timeoutMs}ms`,
                            'TASK_TIMEOUT',
                            504,
                            { taskName, timeoutMs }
                        )
                    );
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

interface TriggerRunLike {
    id: string;
    output?: unknown;
}

async function triggerAndPollWithLogs<TPayload extends Record<string, unknown>>(
    taskName: string,
    payload: TPayload,
    context: { nodeId: string; nodeType: string }
): Promise<TriggerRunLike> {
    const startedAt = Date.now();
    devLog('trigger.start', {
        taskName,
        nodeId: context.nodeId,
        nodeType: context.nodeType,
    });

    try {
        const run = await withTaskTimeout(
            taskName,
            (async () => {
                const handle = await tasks.trigger(taskName, payload);
                devLog('trigger.accepted', {
                    taskName,
                    nodeId: context.nodeId,
                    nodeType: context.nodeType,
                    runId: handle.id,
                });

                return runs.poll(handle.id, { pollIntervalMs: 1000 });
            })()
        );

        if (!run.isSuccess) {
            throw new WorkflowError(
                `Task "${taskName}" failed`,
                'TASK_FAILED',
                502,
                {
                    taskName,
                    triggerRunId: run.id,
                    triggerStatus: run.status,
                    triggerError: run.error ?? null,
                }
            );
        }

        devLog('trigger.success', {
            taskName,
            nodeId: context.nodeId,
            nodeType: context.nodeType,
            runId: run.id,
            durationMs: Date.now() - startedAt,
        });
        return { id: run.id, output: run.output };
    } catch (error) {
        devLog('trigger.error', {
            taskName,
            nodeId: context.nodeId,
            nodeType: context.nodeType,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

async function executeNode(
    node: CustomNode,
    inputs: Record<string, unknown>,
    userId: string
): Promise<NodeExecutionOutcome> {
    const useTrigger = !!process.env.TRIGGER_SECRET_KEY;

    switch (node.type) {
        case 'text': {
            const value = toStringValue(node.data.value) ?? '';

            if (useTrigger) {
                const run = await triggerAndPollWithLogs(
                    'text-passthrough',
                    { value },
                    { nodeId: node.id, nodeType: node.type }
                );
                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                return {
                    outputs: {
                        text: toStringValue(runOutput.text) ?? value,
                        value: toStringValue(runOutput.value) ?? value,
                    },
                    taskName: 'text-passthrough',
                    triggerRunId: run.id,
                };
            }

            return {
                outputs: { text: value, value },
            };
        }

        case 'upload_image': {
            const payload = {
                imageUrl: node.data.imageUrl ?? null,
                assetId: node.data.assetId ?? null,
                mimeType: node.data.mimeType ?? null,
                width: node.data.width ?? null,
                height: node.data.height ?? null,
            };

            if (useTrigger) {
                const run = await triggerAndPollWithLogs(
                    'upload-image-passthrough',
                    payload,
                    { nodeId: node.id, nodeType: node.type }
                );
                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                return {
                    outputs: {
                        imageUrl: runOutput.imageUrl ?? payload.imageUrl,
                        assetId: runOutput.assetId ?? payload.assetId,
                        mimeType: runOutput.mimeType ?? payload.mimeType,
                        width: runOutput.width ?? payload.width,
                        height: runOutput.height ?? payload.height,
                    },
                    taskName: 'upload-image-passthrough',
                    triggerRunId: run.id,
                };
            }

            return { outputs: payload };
        }

        case 'upload_video': {
            const payload = {
                videoUrl: node.data.videoUrl ?? null,
                assetId: node.data.assetId ?? null,
                mimeType: node.data.mimeType ?? null,
                durationMs: node.data.durationMs ?? null,
                thumbnailUrl: node.data.thumbnailUrl ?? null,
            };

            if (useTrigger) {
                const run = await triggerAndPollWithLogs(
                    'upload-video-passthrough',
                    payload,
                    { nodeId: node.id, nodeType: node.type }
                );
                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                return {
                    outputs: {
                        videoUrl: runOutput.videoUrl ?? payload.videoUrl,
                        assetId: runOutput.assetId ?? payload.assetId,
                        mimeType: runOutput.mimeType ?? payload.mimeType,
                        durationMs: runOutput.durationMs ?? payload.durationMs,
                        thumbnailUrl: runOutput.thumbnailUrl ?? payload.thumbnailUrl,
                    },
                    taskName: 'upload-video-passthrough',
                    triggerRunId: run.id,
                };
            }

            return { outputs: payload };
        }

        case 'llm': {
            const model = toStringValue(node.data.selectedModel) ?? 'gemini-3-flash-preview';
            const systemPrompt = toStringValue(inputs.system_prompt);
            const userMessage = toStringValue(inputs.user_message);
            const imageUrls = Array.isArray(inputs.images)
                ? inputs.images.map((image) => toStringValue(image)).filter(Boolean)
                : [];

            if (!userMessage) {
                throw new WorkflowError('LLM node requires a user message input', 'MISSING_INPUT', 400);
            }

            if (process.env.TRIGGER_SECRET_KEY) {
                const run = await triggerAndPollWithLogs(
                    'llm-execute',
                    {
                        model,
                        systemPrompt,
                        userMessage,
                        imageUrls,
                    },
                    { nodeId: node.id, nodeType: node.type }
                );

                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                const text = toStringValue(runOutput.text) ?? '';

                return {
                    outputs: {
                        text,
                        response: text,
                        model,
                    },
                    taskName: 'llm-execute',
                    triggerRunId: run.id,
                };
            }

            const fallbackText = `[Simulated response] ${userMessage}`;
            return {
                outputs: {
                    text: fallbackText,
                    response: fallbackText,
                    model,
                },
            };
        }

        case 'crop_image': {
            const imageUrl = toStringValue(inputs.image_url);
            const xPercent = toNumberValue(inputs.x_percent, 0);
            const yPercent = toNumberValue(inputs.y_percent, 0);
            const widthPercent = toNumberValue(inputs.width_percent, 100);
            const heightPercent = toNumberValue(inputs.height_percent, 100);

            if (!imageUrl) {
                throw new WorkflowError('Crop Image node requires an image input', 'MISSING_INPUT', 400);
            }

            if (process.env.TRIGGER_SECRET_KEY) {
                const run = await triggerAndPollWithLogs(
                    'crop-image',
                    {
                        imageUrl,
                        xPercent,
                        yPercent,
                        widthPercent,
                        heightPercent,
                    },
                    { nodeId: node.id, nodeType: node.type }
                );

                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                const croppedUrl = toStringValue(runOutput.croppedUrl) ?? imageUrl;

                return {
                    outputs: {
                        croppedUrl,
                        imageUrl: croppedUrl,
                    },
                    taskName: 'crop-image',
                    triggerRunId: run.id,
                };
            }

            return {
                outputs: {
                    croppedUrl: imageUrl,
                    imageUrl,
                },
            };
        }

        case 'extract_frame': {
            const videoUrl = toStringValue(inputs.video_url);
            const timestamp = inputs.timestamp ?? 0;

            if (!videoUrl) {
                throw new WorkflowError(
                    'Extract Frame node requires a video input',
                    'MISSING_INPUT',
                    400
                );
            }

            if (process.env.TRIGGER_SECRET_KEY) {
                const run = await triggerAndPollWithLogs(
                    'extract-frame',
                    {
                        videoUrl,
                        timestamp,
                    },
                    { nodeId: node.id, nodeType: node.type }
                );

                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};
                const extractedFrameUrl =
                    toStringValue(runOutput.frameUrl) ??
                    toStringValue(runOutput.extractedFrameUrl) ??
                    '';

                return {
                    outputs: {
                        extractedFrameUrl,
                        frameUrl: extractedFrameUrl,
                        imageUrl: extractedFrameUrl,
                    },
                    taskName: 'extract-frame',
                    triggerRunId: run.id,
                };
            }

            const fallbackImage =
                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="%231f2937"/><text x="50%" y="50%" fill="%23cbd5e1" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="20">Frame Preview</text></svg>';

            return {
                outputs: {
                    extractedFrameUrl: fallbackImage,
                    frameUrl: fallbackImage,
                    imageUrl: fallbackImage,
                },
            };
        }

        case 'generate_image': {
            const prompt = toStringValue(inputs.prompt);
            const model =
                toStringValue(inputs.model) ??
                process.env.GOOGLE_IMAGE_MODEL ??
                'gemini-2.5-flash-image';
            const referenceAUrl = toStringValue(inputs.reference_a);
            const referenceBUrl = toStringValue(inputs.reference_b);

            if (!prompt) {
                throw new WorkflowError(
                    'Generate Image node requires a prompt input',
                    'MISSING_INPUT',
                    400
                );
            }

            let generatedImageSourceUrl: string | undefined;
            let generatedMimeType: string | undefined;
            let triggerRunId: string | undefined;

            if (process.env.TRIGGER_SECRET_KEY) {
                const run = await triggerAndPollWithLogs(
                    'generate-image',
                    {
                        model,
                        prompt,
                        referenceAUrl: referenceAUrl ?? undefined,
                        referenceBUrl: referenceBUrl ?? undefined,
                    },
                    { nodeId: node.id, nodeType: node.type }
                );

                const runOutput =
                    (typeof run.output === 'object' && run.output !== null
                        ? (run.output as Record<string, unknown>)
                        : {}) ?? {};

                generatedImageSourceUrl =
                    toStringValue(runOutput.generatedImageDataUrl) ??
                    toStringValue(runOutput.imageUrl) ??
                    toStringValue(runOutput.url);
                generatedMimeType = toStringValue(runOutput.mimeType);
                triggerRunId = run.id;

                if (!generatedImageSourceUrl) {
                    throw new WorkflowError(
                        'Image generation task did not return an image payload',
                        'INVALID_GENERATION_OUTPUT',
                        502
                    );
                }
            } else {
                const fallbackText = encodeURIComponent(`Generated: ${prompt.slice(0, 80)}`);
                generatedImageSourceUrl =
                    `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="%230f172a"/><stop offset="100%" stop-color="%232563eb"/></linearGradient></defs><rect width="1024" height="1024" fill="url(%23g)"/><text x="50%" y="50%" fill="%23e2e8f0" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="36">${fallbackText}</text></svg>`;
                generatedMimeType = 'image/svg+xml';
            }

            const durable = await persistDurableAssetFromUrl({
                userId,
                uploadType: 'image',
                sourceUrl: generatedImageSourceUrl,
                existingMimeType: generatedMimeType,
            });

            return {
                outputs: {
                    url: durable.url,
                    imageUrl: durable.url,
                    sourceUrl: generatedImageSourceUrl,
                    prompt,
                    model,
                    provider: durable.provider,
                    assetId: durable.asset.id,
                    publicId: durable.publicId,
                    mimeType: durable.mimeType,
                    bytes: durable.bytes,
                    width: durable.width,
                    height: durable.height,
                },
                taskName: process.env.TRIGGER_SECRET_KEY ? 'generate-image' : undefined,
                triggerRunId,
            };
        }

        case 'export_text': {
            const text = toStringValue(inputs.text);
            if (!text) {
                throw new WorkflowError(
                    'Export Text node requires a text input',
                    'MISSING_INPUT',
                    400
                );
            }

            return {
                outputs: {
                    text,
                    value: text,
                    format: 'txt',
                },
            };
        }

        case 'export_image': {
            const sourceUrl = toStringValue(inputs.image);
            const mimeType = toStringValue(inputs.mimeType);
            if (!sourceUrl) {
                throw new WorkflowError(
                    'Export Image node requires an image input',
                    'MISSING_INPUT',
                    400
                );
            }

            if (!isExpectedMedia('image', { mimeType, url: sourceUrl })) {
                throw new WorkflowError(
                    'Export Image node received a non-image input',
                    'INVALID_MEDIA_TYPE',
                    400
                );
            }

            const durable = await persistDurableAssetFromUrl({
                userId,
                uploadType: 'image',
                sourceUrl,
                existingMimeType: mimeType,
            });

            return {
                outputs: {
                    url: durable.url,
                    imageUrl: durable.url,
                    sourceUrl,
                    provider: durable.provider,
                    assetId: durable.asset.id,
                    publicId: durable.publicId,
                    mimeType: durable.mimeType,
                    bytes: durable.bytes,
                    width: durable.width,
                    height: durable.height,
                },
            };
        }

        case 'export_video': {
            const sourceUrl = toStringValue(inputs.video);
            const mimeType = toStringValue(inputs.mimeType);
            if (!sourceUrl) {
                throw new WorkflowError(
                    'Export Video node requires a video input',
                    'MISSING_INPUT',
                    400
                );
            }

            if (!isExpectedMedia('video', { mimeType, url: sourceUrl })) {
                throw new WorkflowError(
                    'Export Video node received a non-video input',
                    'INVALID_MEDIA_TYPE',
                    400
                );
            }

            const durable = await persistDurableAssetFromUrl({
                userId,
                uploadType: 'video',
                sourceUrl,
                existingMimeType: mimeType,
            });

            return {
                outputs: {
                    url: durable.url,
                    videoUrl: durable.url,
                    sourceUrl,
                    provider: durable.provider,
                    assetId: durable.asset.id,
                    publicId: durable.publicId,
                    mimeType: durable.mimeType,
                    bytes: durable.bytes,
                    width: durable.width,
                    height: durable.height,
                    durationMs: durable.durationMs,
                },
            };
        }

        default:
            throw new WorkflowError(`Unsupported node type: ${node.type}`, 'INVALID_NODE_TYPE', 400);
    }
}

export const POST = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();
    const body = (await request.json().catch(() => ({}))) as unknown;
    const { workflowId, scope, selectedNodeIds = [] } = ExecuteRequestSchema.parse(body);

    const workflow = await prisma.workflow.findFirst({
        where: {
            id: workflowId,
            ownerId: user.id,
            isArchived: false,
        },
        include: {
            versions: {
                orderBy: { version: 'desc' },
                take: 1,
            },
        },
    });

    if (!workflow) {
        throw new WorkflowError('Workflow not found', 'NOT_FOUND', 404);
    }

    const latestVersion = workflow.versions[0];
    if (!latestVersion) {
        throw new WorkflowError('No workflow version available to execute', 'NOT_FOUND', 404);
    }

    const allNodes = Array.isArray(latestVersion.nodes)
        ? (latestVersion.nodes as unknown as CustomNode[])
        : [];
    const allEdges = Array.isArray(latestVersion.edges)
        ? (latestVersion.edges as unknown as CustomEdge[])
        : [];

    const scopedGraph = getSubgraphForScope(allNodes, allEdges, scope, selectedNodeIds);
    if (!scopedGraph.nodes.length) {
        throw new WorkflowError('No nodes available for the selected execution scope', 'INVALID_SCOPE', 400);
    }

    if (
        scope === 'FULL' &&
        !scopedGraph.nodes.some(
            (node) =>
                node.type === 'export_text' ||
                node.type === 'export_image' ||
                node.type === 'export_video'
        )
    ) {
        throw new WorkflowError(
            'Add at least one Export Text, Export Image, or Export Video node before running the full workflow.',
            'MISSING_EXPORT_NODE',
            400
        );
    }

    if (!validateDAG(scopedGraph.nodes, scopedGraph.edges)) {
        throw new WorkflowError('Workflow contains circular dependencies', 'INVALID_DAG', 400);
    }

    const executionLevels = getExecutionLevels(scopedGraph.nodes, scopedGraph.edges);
    devLog('workflow.execution.start', {
        workflowId,
        scope,
        selectedNodeIds,
        levelCount: executionLevels.length,
        nodeCount: scopedGraph.nodes.length,
        edgeCount: scopedGraph.edges.length,
        triggerEnabled: Boolean(process.env.TRIGGER_SECRET_KEY),
        workflowTaskTimeoutMs: getWorkflowTaskTimeoutMs(),
    });

    const runStart = Date.now();
    const init = await prisma.$transaction(async (tx) => {
        const updatedWorkflow = await tx.workflow.update({
            where: { id: workflowId },
            data: { runCounter: { increment: 1 } },
            select: { runCounter: true },
        });

        const workflowRun = await tx.workflowRun.create({
            data: {
                workflowId,
                workflowVersionId: latestVersion.id,
                userId: user.id,
                runNumber: updatedWorkflow.runCounter,
                scope,
                selectedNodeIds,
                status: 'RUNNING',
            },
        });

        const nodeRuns = await Promise.all(
            scopedGraph.nodes.map((node) =>
                tx.nodeRun.create({
                    data: {
                        workflowRunId: workflowRun.id,
                        nodeId: node.id,
                        nodeType: toPrismaNodeType(node.type ?? ''),
                        status: 'QUEUED',
                    },
                })
            )
        );

        return { workflowRun, nodeRuns };
    });

    const nodeRunByNodeId = new Map(init.nodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun]));
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    const errors: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const [levelIndex, level] of executionLevels.entries()) {
        devLog('workflow.execution.level.start', {
            levelIndex,
            nodeIds: level.map((node) => node.id),
            nodeTypes: level.map((node) => node.type),
        });
        const levelResults = await Promise.all(
            level.map(async (node) => {
                const nodeRun = nodeRunByNodeId.get(node.id);
                if (!nodeRun) {
                    return { success: false, nodeId: node.id, error: 'Node run record missing' };
                }

                const inputs = resolveNodeInputs(node, scopedGraph.edges, nodeOutputs, scopedGraph.nodes);
                const nodeStart = Date.now();
                devLog('workflow.execution.node.start', {
                    levelIndex,
                    nodeId: node.id,
                    nodeType: node.type,
                });

                await prisma.nodeRun.update({
                    where: { id: nodeRun.id },
                    data: {
                        status: 'RUNNING',
                        startedAt: new Date(nodeStart),
                        inputs: inputs as Prisma.InputJsonValue,
                    },
                });

                try {
                    const outcome = await executeNode(node, inputs, user.id);
                    nodeOutputs.set(node.id, outcome.outputs);

                    await prisma.nodeRun.update({
                        where: { id: nodeRun.id },
                        data: {
                            status: 'SUCCESS',
                            finishedAt: new Date(),
                            durationMs: Date.now() - nodeStart,
                            outputs: outcome.outputs as Prisma.InputJsonValue,
                            taskName: outcome.taskName,
                            triggerRunId: outcome.triggerRunId,
                        },
                    });

                    devLog('workflow.execution.node.success', {
                        levelIndex,
                        nodeId: node.id,
                        nodeType: node.type,
                        durationMs: Date.now() - nodeStart,
                    });

                    return { success: true, nodeId: node.id };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Execution failed';
                    const errorDetails =
                        error instanceof WorkflowError
                            ? {
                                name: error.name,
                                code: error.code,
                                status: error.status,
                                details: error.details ?? null,
                                stack: error.stack ?? null,
                            }
                            : error instanceof Error
                                ? {
                                    name: error.name,
                                    stack: error.stack ?? null,
                                }
                                : {
                                    message: String(error),
                                };

                    await prisma.nodeRun.update({
                        where: { id: nodeRun.id },
                        data: {
                            status: 'FAILED',
                            finishedAt: new Date(),
                            durationMs: Date.now() - nodeStart,
                            errorMessage: message,
                            errorDetails: errorDetails as Prisma.InputJsonValue,
                        },
                    });

                    devLog('workflow.execution.node.error', {
                        levelIndex,
                        nodeId: node.id,
                        nodeType: node.type,
                        durationMs: Date.now() - nodeStart,
                        error: message,
                    });

                    return { success: false, nodeId: node.id, error: message };
                }
            })
        );

        for (const result of levelResults) {
            if (result.success) {
                successCount += 1;
            } else {
                failureCount += 1;
                if (result.error) {
                    errors.push(`${result.nodeId}: ${result.error}`);
                }
            }
        }

        devLog('workflow.execution.level.done', {
            levelIndex,
            successCount,
            failureCount,
        });
    }

    const finalStatus =
        failureCount === 0 ? 'SUCCESS' : successCount === 0 ? 'FAILED' : 'PARTIAL';
    const durationMs = Date.now() - runStart;

    await prisma.workflowRun.update({
        where: { id: init.workflowRun.id },
        data: {
            status: finalStatus,
            finishedAt: new Date(),
            durationMs,
            errorSummary: errors.length > 0 ? errors.slice(0, 3).join(' | ') : null,
        },
    });

    const refreshedRun = await prisma.workflowRun.findUnique({
        where: { id: init.workflowRun.id },
        include: {
            nodeRuns: {
                orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
            },
        },
    });

    return Response.json({
        success: true,
        runId: init.workflowRun.id,
        runNumber: init.workflowRun.runNumber,
        status: finalStatus,
        durationMs,
        run: refreshedRun,
    });
});
