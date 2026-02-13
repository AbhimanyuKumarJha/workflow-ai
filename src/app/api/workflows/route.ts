import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { withErrorHandler } from '@/lib/error-handler';
import { WorkflowCreateSchema } from '@/lib/validations';

const emptySnapshot = {
    nodes: [],
    edges: [],
    viewport: {
        x: 0,
        y: 0,
        zoom: 1,
    },
};

export const GET = withErrorHandler(async () => {
    const user = await getCurrentUserOrThrow();

    const workflows = await prisma.workflow.findMany({
        where: {
            ownerId: user.id,
            isArchived: false,
        },
        orderBy: {
            updatedAt: 'desc',
        },
        include: {
            versions: {
                orderBy: { version: 'desc' },
                take: 1,
            },
            _count: {
                select: { runs: true },
            },
        },
    });

    return Response.json({
        workflows: workflows.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
            runCount: workflow._count.runs,
            latestVersion: workflow.versions[0]?.version ?? 0,
        })),
    });
});

export const POST = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = WorkflowCreateSchema.parse(body);

    const snapshot = parsed.snapshot ?? emptySnapshot;

    const created = await prisma.$transaction(async (tx) => {
        const workflow = await tx.workflow.create({
            data: {
                ownerId: user.id,
                name: parsed.name ?? 'Untitled workflow',
                description: parsed.description,
            },
        });

        const version = await tx.workflowVersion.create({
            data: {
                workflowId: workflow.id,
                version: 1,
                nodes: snapshot.nodes as Prisma.InputJsonValue,
                edges: snapshot.edges as Prisma.InputJsonValue,
                viewport: snapshot.viewport as Prisma.InputJsonValue,
                createdById: user.id,
            },
        });

        return { workflow, version };
    });

    return Response.json(
        {
            workflow: {
                id: created.workflow.id,
                name: created.workflow.name,
                description: created.workflow.description,
                createdAt: created.workflow.createdAt,
                updatedAt: created.workflow.updatedAt,
                latestVersion: created.version.version,
            },
            version: created.version,
        },
        { status: 201 }
    );
});
