import { AssetType } from '@prisma/client';
import { z } from 'zod';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { isCloudinaryConfigured, uploadRemoteToCloudinary } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';

const importSchema = z.object({
    url: z.string().url(),
    type: z.enum(['image', 'video']),
    assemblyId: z.string().trim().min(1).max(255).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
});

function toAssetType(uploadType: 'image' | 'video'): AssetType {
    return uploadType === 'video' ? AssetType.VIDEO : AssetType.IMAGE;
}

function buildMimeType(input: {
    uploadType: 'image' | 'video';
    existingMimeType?: string;
    resourceType?: string;
    format?: string;
}): string | undefined {
    if (input.existingMimeType) {
        return input.existingMimeType;
    }

    const normalizedResourceType = input.resourceType?.toLowerCase();
    if (normalizedResourceType === 'video' && input.format) {
        return `video/${input.format.toLowerCase()}`;
    }

    if (normalizedResourceType === 'image' && input.format) {
        return `image/${input.format.toLowerCase()}`;
    }

    return input.uploadType === 'video' ? 'video/mp4' : 'image/jpeg';
}

export const POST = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = importSchema.parse(body);

    if (!isCloudinaryConfigured()) {
        throw new WorkflowError(
            'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
            'CLOUDINARY_NOT_CONFIGURED',
            500
        );
    }

    const uploaded = await uploadRemoteToCloudinary({
        sourceUrl: parsed.url,
        uploadType: parsed.type,
        assemblyId: parsed.assemblyId,
    });

    const existingAsset = await prisma.asset.findFirst({
        where: {
            provider: 'cloudinary',
            url: uploaded.url,
        },
    });

    const asset =
        existingAsset ??
        (await prisma.asset.create({
            data: {
                userId: user.id,
                type: toAssetType(parsed.type),
                url: uploaded.url,
                provider: 'cloudinary',
                assemblyId: parsed.assemblyId,
                mimeType: buildMimeType({
                    uploadType: parsed.type,
                    existingMimeType: parsed.mimeType,
                    resourceType: uploaded.resourceType,
                    format: uploaded.format,
                }),
                bytes: uploaded.bytes,
                width: uploaded.width,
                height: uploaded.height,
                durationMs: uploaded.durationMs,
            },
        }));

    return Response.json(
        {
            asset,
            publicId: uploaded.publicId,
            provider: 'cloudinary',
        },
        { status: 200 }
    );
});
