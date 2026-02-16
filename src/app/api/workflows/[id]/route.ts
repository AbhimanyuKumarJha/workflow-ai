import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { WorkflowUpdateSchema } from '@/lib/validations';

interface RouteContext {
    params: Promise<{ id: string }> | { id: string };
}

async function resolveWorkflowId(context: RouteContext): Promise<string> {
    const params = await Promise.resolve(context.params);
    return params.id;
}

export const GET = withErrorHandler(async (_request: Request, context: RouteContext) => {
    const user = await getCurrentUserOrThrow();
    const workflowId = await resolveWorkflowId(context);

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

    const version = workflow.versions[0];
    if (!version) {
        throw new WorkflowError('Workflow has no saved versions', 'NOT_FOUND', 404);
    }

    return Response.json({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        version,
    });
});

export const PUT = withErrorHandler(async (request: Request, context: RouteContext) => {
    const user = await getCurrentUserOrThrow();
    const workflowId = await resolveWorkflowId(context);
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = WorkflowUpdateSchema.parse(body);

    const existing = await prisma.workflow.findFirst({
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

    if (!existing) {
        throw new WorkflowError('Workflow not found', 'NOT_FOUND', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
        const nextVersion = (existing.versions[0]?.version ?? 0) + 1;

        const workflow = await tx.workflow.update({
            where: { id: workflowId },
            data: {
                ...(parsed.name ? { name: parsed.name } : {}),
                ...(parsed.description !== undefined ? { description: parsed.description } : {}),
            },
        });

        const version = await tx.workflowVersion.create({
            data: {
                workflowId,
                version: nextVersion,
                nodes: parsed.nodes as Prisma.InputJsonValue,
                edges: parsed.edges as Prisma.InputJsonValue,
                viewport: parsed.viewport as Prisma.InputJsonValue,
                createdById: user.id,
            },
        });

        return { workflow, version };
    });

    return Response.json({
        workflow: {
            id: result.workflow.id,
            name: result.workflow.name,
            description: result.workflow.description,
            updatedAt: result.workflow.updatedAt,
        },
        version: result.version,
    });
});

export const DELETE = withErrorHandler(async (_request: Request, context: RouteContext) => {
    const user = await getCurrentUserOrThrow();
    const workflowId = await resolveWorkflowId(context);

    const existing = await prisma.workflow.findFirst({
        where: {
            id: workflowId,
            ownerId: user.id,
            isArchived: false,
        },
        select: {
            id: true,
        },
    });

    if (!existing) {
        throw new WorkflowError('Workflow not found', 'NOT_FOUND', 404);
    }

    await prisma.workflow.delete({
        where: {
            id: workflowId,
        },
    });

    return Response.json({
        success: true,
    });
});
