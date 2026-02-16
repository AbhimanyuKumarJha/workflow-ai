import { z } from 'zod';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { getCurrentUserOrThrow } from '@/lib/current-user';

const paramsSchema = z.object({
    assemblyId: z.string().trim().min(1),
});

export const GET = withErrorHandler(async (_request: Request, context: { params: Promise<{ assemblyId: string }> }) => {
    await getCurrentUserOrThrow();

    const params = await context.params;
    const parsed = paramsSchema.parse(params);
    const endpoint = `https://api2.transloadit.com/assemblies/${encodeURIComponent(parsed.assemblyId)}`;

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new WorkflowError(
            `Failed to fetch assembly ${parsed.assemblyId}`,
            'TRANSLOADIT_ASSEMBLY_FETCH_FAILED',
            response.status,
            payload
        );
    }

    return Response.json(payload, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
});
