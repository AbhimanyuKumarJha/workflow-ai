import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { buildSignedAssemblyOptions } from '@/lib/transloadit';

const querySchema = z.object({
    type: z.enum(['image', 'video']).default('image'),
});

export const GET = withErrorHandler(async (request: Request) => {
    await getCurrentUserOrThrow();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
        type: searchParams.get('type') ?? undefined,
    });

    const assemblyOptions = buildSignedAssemblyOptions(parsed.type);

    return Response.json(assemblyOptions, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
});
