import { z } from 'zod';
import { AssetType } from '@prisma/client';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { isCloudinaryConfigured, uploadRemoteToCloudinary } from '@/lib/cloudinary';
import { buildTransloaditApiAuthHeaders } from '@/lib/transloadit';
import {
    isCloudinaryUrl,
    resolveAssemblyOutput,
    TransloaditAssemblyLike,
} from '@/lib/transloadit-results';

const querySchema = z.object({
    assemblyId: z.string().trim().min(1),
    type: z.enum(['image', 'video']),
});

const TRANSLOADIT_TERMINAL_OK_STATES = new Set([
    'ASSEMBLY_COMPLETED',
    'REQUEST_ABORTED',
    'ASSEMBLY_CANCELED',
    'ASSEMBLY_EXECUTION_REJECTED',
]);
const TRANSLOADIT_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ASSEMBLY_FETCH_ATTEMPTS = 3;

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

async function fetchAssemblyWithRetry(endpoint: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ASSEMBLY_FETCH_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    ...buildTransloaditApiAuthHeaders(),
                },
                cache: 'no-store',
            });

            if (!TRANSLOADIT_RETRYABLE_STATUS.has(response.status) || attempt === MAX_ASSEMBLY_FETCH_ATTEMPTS) {
                return response;
            }
        } catch (error) {
            lastError = error;
            if (attempt === MAX_ASSEMBLY_FETCH_ATTEMPTS) {
                break;
            }
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }

    throw new WorkflowError(
        'Failed to fetch Transloadit assembly',
        'ASSEMBLY_FETCH_FAILED',
        502,
        lastError
    );
}

export const GET = withErrorHandler(async (request: Request) => {
    const user = await getCurrentUserOrThrow();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
        assemblyId: searchParams.get('assemblyId') ?? undefined,
        type: searchParams.get('type') ?? undefined,
    });

    const existingCloudinaryAsset = await prisma.asset.findFirst({
        where: {
            userId: user.id,
            type: toAssetType(parsed.type),
            provider: 'cloudinary',
            assemblyId: parsed.assemblyId,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    if (existingCloudinaryAsset) {
        if (process.env.NODE_ENV !== 'production') {
            console.info('[TRANSLOADIT_RESOLVE] using cached cloudinary asset', {
                assemblyId: parsed.assemblyId,
                assetId: existingCloudinaryAsset.id,
            });
        }

        return Response.json(
            {
                assemblyId: parsed.assemblyId,
                url: existingCloudinaryAsset.url,
                mimeType: existingCloudinaryAsset.mimeType ?? undefined,
                outputType: parsed.type,
                isTempUrl: false,
                sourceStep: 'cloudinary',
                sourceGroup: 'cloudinary',
                provider: 'cloudinary',
                assetId: existingCloudinaryAsset.id,
            },
            { status: 200 }
        );
    }

    const endpoint = `https://api2.transloadit.com/assemblies/${encodeURIComponent(parsed.assemblyId)}`;
    const response = await fetchAssemblyWithRetry(endpoint);

    const payload = (await response.json().catch(() => null)) as TransloaditAssemblyLike | null;

    if (!response.ok) {
        const errorCode = response.status === 404 ? 'ASSEMBLY_NOT_FOUND' : 'ASSEMBLY_FETCH_FAILED';
        throw new WorkflowError(
            `Failed to fetch assembly ${parsed.assemblyId}`,
            errorCode,
            response.status,
            payload
        );
    }

    if (!payload || typeof payload !== 'object') {
        throw new WorkflowError('Invalid assembly payload', 'ASSEMBLY_INVALID_PAYLOAD', 502);
    }

    const status = payload.ok;
    const isTerminal = typeof status === 'string' && TRANSLOADIT_TERMINAL_OK_STATES.has(status);
    if (!isTerminal) {
        return Response.json(
            {
                code: 'ASSEMBLY_IN_PROGRESS',
                assemblyId: parsed.assemblyId,
                status: status ?? null,
            },
            { status: 202 }
        );
    }

    const resolved = resolveAssemblyOutput(payload, parsed.type, { allowTemp: true });
    if (resolved.output) {
        const sourceUrl = resolved.output.url;

        if (isCloudinaryUrl(sourceUrl)) {
            const existingByUrl = await prisma.asset.findFirst({
                where: {
                    provider: 'cloudinary',
                    url: sourceUrl,
                },
            });

            const persistedAsset =
                existingByUrl ??
                (await prisma.asset.create({
                    data: {
                        userId: user.id,
                        type: toAssetType(parsed.type),
                        url: sourceUrl,
                        provider: 'cloudinary',
                        assemblyId: parsed.assemblyId,
                        mimeType: resolved.output.mimeType,
                    },
                }));

            return Response.json(
                {
                    assemblyId: parsed.assemblyId,
                    url: sourceUrl,
                    mimeType: resolved.output.mimeType,
                    outputType: resolved.output.outputType ?? parsed.type,
                    isTempUrl: false,
                    sourceStep: resolved.output.sourceStep,
                    sourceGroup: resolved.output.sourceGroup,
                    provider: 'cloudinary',
                    assetId: persistedAsset.id,
                },
                { status: 200 }
            );
        }

        if (!isCloudinaryConfigured()) {
            throw new WorkflowError(
                'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
                'CLOUDINARY_NOT_CONFIGURED',
                500
            );
        }

        if (process.env.NODE_ENV !== 'production') {
            console.info('[TRANSLOADIT_RESOLVE] copying result to cloudinary', {
                assemblyId: parsed.assemblyId,
                sourceStep: resolved.output.sourceStep,
                sourceGroup: resolved.output.sourceGroup,
                isTempUrl: resolved.output.isTempUrl,
            });
        }

        const uploaded = await uploadRemoteToCloudinary({
            sourceUrl,
            uploadType: parsed.type,
            assemblyId: parsed.assemblyId,
        });

        if (process.env.NODE_ENV !== 'production') {
            console.info('[TRANSLOADIT_RESOLVE] copied to cloudinary', {
                assemblyId: parsed.assemblyId,
                publicId: uploaded.publicId,
                url: uploaded.url,
            });
        }

        const existingByUrl = await prisma.asset.findFirst({
            where: {
                provider: 'cloudinary',
                url: uploaded.url,
            },
        });

        const persistedAsset =
            existingByUrl ??
            (await prisma.asset.create({
                data: {
                    userId: user.id,
                    type: toAssetType(parsed.type),
                    url: uploaded.url,
                    provider: 'cloudinary',
                    assemblyId: parsed.assemblyId,
                    mimeType: buildMimeType({
                        uploadType: parsed.type,
                        existingMimeType: resolved.output.mimeType,
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
                assemblyId: parsed.assemblyId,
                url: uploaded.url,
                mimeType: buildMimeType({
                    uploadType: parsed.type,
                    existingMimeType: resolved.output.mimeType,
                    resourceType: uploaded.resourceType,
                    format: uploaded.format,
                }),
                outputType: parsed.type,
                isTempUrl: false,
                sourceStep: 'cloudinary',
                sourceGroup: 'cloudinary',
                provider: 'cloudinary',
                assetId: persistedAsset.id,
                publicId: uploaded.publicId,
            },
            { status: 200 }
        );
    }

    if (resolved.hasWrongType) {
        const code = parsed.type === 'video' ? 'VIDEO_RESULT_NOT_VIDEO' : 'IMAGE_RESULT_NOT_IMAGE';
        return Response.json(
            {
                code,
                assemblyId: parsed.assemblyId,
            },
            { status: 422 }
        );
    }

    return Response.json(
        {
            code: 'NO_COMPATIBLE_RESULT',
            assemblyId: parsed.assemblyId,
            message:
                'Assembly completed but no compatible output URL was found in results/uploads.',
        },
        { status: 409 }
    );
});
