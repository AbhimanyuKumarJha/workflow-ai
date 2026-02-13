import { NodeType, Prisma } from '@prisma/client';
import { tasks } from '@trigger.dev/sdk/v3';
import prisma from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
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
    };

    const result = mapping[nodeType];
    if (!result) {
        throw new WorkflowError(`Unsupported node type: ${nodeType}`, 'INVALID_NODE_TYPE', 400);
    }

    return result;
}

async function executeNode(
    node: CustomNode,
    inputs: Record<string, unknown>
): Promise<NodeExecutionOutcome> {
    switch (node.type) {
        case 'text': {
            const value = toStringValue(node.data.value) ?? '';
            return {
                outputs: {
                    text: value,
                    value,
                },
            };
        }

        case 'upload_image': {
            return {
                outputs: {
                    imageUrl: node.data.imageUrl ?? null,
                    assetId: node.data.assetId ?? null,
                    mimeType: node.data.mimeType ?? null,
                    width: node.data.width ?? null,
                    height: node.data.height ?? null,
                },
            };
        }

        case 'upload_video': {
            return {
                outputs: {
                    videoUrl: node.data.videoUrl ?? null,
                    assetId: node.data.assetId ?? null,
                    mimeType: node.data.mimeType ?? null,
                    durationMs: node.data.durationMs ?? null,
                    thumbnailUrl: node.data.thumbnailUrl ?? null,
                },
            };
        }

        case 'llm': {
            const model = toStringValue(node.data.selectedModel) ?? 'gemini-2.0-flash-exp';
            const systemPrompt = toStringValue(inputs.system_prompt);
            const userMessage = toStringValue(inputs.user_message);
            const imageUrls = Array.isArray(inputs.images)
                ? inputs.images.map((image) => toStringValue(image)).filter(Boolean)
                : [];

            if (!userMessage) {
                throw new WorkflowError('LLM node requires a user message input', 'MISSING_INPUT', 400);
            }

            if (process.env.TRIGGER_SECRET_KEY) {
                const run = await tasks.triggerAndPoll('llm-execute', {
                    model,
                    systemPrompt,
                    userMessage,
                    imageUrls,
                });

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
                const run = await tasks.triggerAndPoll('crop-image', {
                    imageUrl,
                    xPercent,
                    yPercent,
                    widthPercent,
                    heightPercent,
                });

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
                const run = await tasks.triggerAndPoll('extract-frame', {
                    videoUrl,
                    timestamp,
                });

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

    if (!validateDAG(scopedGraph.nodes, scopedGraph.edges)) {
        throw new WorkflowError('Workflow contains circular dependencies', 'INVALID_DAG', 400);
    }

    const executionLevels = getExecutionLevels(scopedGraph.nodes, scopedGraph.edges);

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

    for (const level of executionLevels) {
        const levelResults = await Promise.all(
            level.map(async (node) => {
                const nodeRun = nodeRunByNodeId.get(node.id);
                if (!nodeRun) {
                    return { success: false, nodeId: node.id, error: 'Node run record missing' };
                }

                const inputs = resolveNodeInputs(node, scopedGraph.edges, nodeOutputs, scopedGraph.nodes);
                const nodeStart = Date.now();

                await prisma.nodeRun.update({
                    where: { id: nodeRun.id },
                    data: {
                        status: 'RUNNING',
                        startedAt: new Date(nodeStart),
                        inputs: inputs as Prisma.InputJsonValue,
                    },
                });

                try {
                    const outcome = await executeNode(node, inputs);
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

                    return { success: true, nodeId: node.id };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Execution failed';
                    const errorDetails = error instanceof Error
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
