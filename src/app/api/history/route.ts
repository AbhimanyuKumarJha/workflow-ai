import { prisma } from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { HistoryQuerySchema } from '@/lib/validations';

export const GET = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();

    const searchParams = new URL(request.url).searchParams;
    const parsed = HistoryQuerySchema.parse({
        workflowId: searchParams.get('workflowId') ?? undefined,
        runId: searchParams.get('runId') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        scope: searchParams.get('scope') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
        cursor: searchParams.get('cursor') ?? undefined,
    });

    if (parsed.runId) {
        const run = await prisma.workflowRun.findFirst({
            where: {
                id: parsed.runId,
                workflow: {
                    ownerId: user.id,
                },
            },
            include: {
                nodeRuns: {
                    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
                },
            },
        });

        if (!run) {
            throw new WorkflowError('Run not found', 'NOT_FOUND', 404);
        }

        return Response.json({ run });
    }

    const workflow = await prisma.workflow.findFirst({
        where: {
            id: parsed.workflowId,
            ownerId: user.id,
            isArchived: false,
        },
        select: { id: true },
    });

    if (!workflow) {
        throw new WorkflowError('Workflow not found', 'NOT_FOUND', 404);
    }

    const runs = await prisma.workflowRun.findMany({
        where: {
            workflowId: workflow.id,
            ...(parsed.status ? { status: parsed.status } : {}),
            ...(parsed.scope ? { scope: parsed.scope } : {}),
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: parsed.limit + 1,
        ...(parsed.cursor
            ? {
                skip: 1,
                cursor: { id: parsed.cursor },
            }
            : {}),
        include: {
            nodeRuns: {
                orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
            },
        },
    });

    const hasMore = runs.length > parsed.limit;
    const items = hasMore ? runs.slice(0, parsed.limit) : runs;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return Response.json({
        runs: items,
        pagination: {
            nextCursor,
            hasMore,
        },
    });
});
