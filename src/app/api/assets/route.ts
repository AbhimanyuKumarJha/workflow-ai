import prisma from '@/lib/prisma';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { withErrorHandler } from '@/lib/error-handler';
import { AssetUploadSchema } from '@/lib/validations';

export const POST = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = AssetUploadSchema.parse(body);

    const asset = await prisma.asset.create({
        data: {
            userId: user.id,
            type: parsed.type,
            url: parsed.url,
            provider: parsed.provider ?? 'transloadit',
            assemblyId: parsed.assemblyId,
            mimeType: parsed.mimeType,
            bytes: parsed.bytes,
            width: parsed.width,
            height: parsed.height,
            durationMs: parsed.durationMs,
        },
    });

    return Response.json(
        {
            asset,
        },
        { status: 201 }
    );
});
