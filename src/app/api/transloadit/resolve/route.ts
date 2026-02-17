import { z } from 'zod';
import { AssetType } from '@prisma/client';
import { withErrorHandler, WorkflowError } from '@/lib/error-handler';
import { getCurrentUserOrThrow } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { persistDurableAssetFromUrl } from '@/lib/assets';
import { buildTransloaditApiAuthHeaders } from '@/lib/transloadit';
import {
    resolveAssemblyOutput,
    TransloaditAssemblyLike,
} from '@/lib/transloadit-results';

const querySchema = z.object({
    assemblyId: z.string().trim().min(1),
    type: z.enum(['image', 'video']),
});

const TRANSLOADIT_SUCCESS_STATES = new Set([
    'ASSEMBLY_COMPLETED',
]);
const TRANSLOADIT_IN_PROGRESS_STATES = new Set([
    'ASSEMBLY_UPLOADING',
    'ASSEMBLY_EXECUTING',
    'ASSEMBLY_IMPORTING',
    'ASSEMBLY_WAITING',
]);
const TRANSLOADIT_TERMINAL_FAILURE_STATES = new Set([
    'REQUEST_ABORTED',
    'ASSEMBLY_CANCELED',
    'ASSEMBLY_EXECUTION_REJECTED',
    'ASSEMBLY_ABORTED',
]);
const TRANSLOADIT_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ASSEMBLY_FETCH_ATTEMPTS = 3;
const RETRY_AFTER_MS = 1500;

function toAssetType(uploadType: 'image' | 'video'): AssetType {
    return uploadType === 'video' ? AssetType.VIDEO : AssetType.IMAGE;
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

    const status = typeof payload.ok === 'string' ? payload.ok : undefined;
    const isSuccess = typeof status === 'string' && TRANSLOADIT_SUCCESS_STATES.has(status);
    const isInProgress =
        !status || TRANSLOADIT_IN_PROGRESS_STATES.has(status);
    const isTerminalFailure =
        (typeof status === 'string' && TRANSLOADIT_TERMINAL_FAILURE_STATES.has(status)) ||
        Boolean(payload.error);

    if (isTerminalFailure) {
        return Response.json(
            {
                code: 'ASSEMBLY_TERMINAL_FAILURE',
                assemblyId: parsed.assemblyId,
                status: status ?? null,
                message:
                    (typeof payload.message === 'string' && payload.message) ||
                    (typeof payload.error === 'string' && payload.error) ||
                    'Transloadit assembly failed before producing a valid output.',
            },
            { status: 409 }
        );
    }

    if (!isSuccess && isInProgress) {
        return Response.json(
            {
                code: 'ASSEMBLY_IN_PROGRESS',
                assemblyId: parsed.assemblyId,
                status: status ?? null,
                retryAfterMs: RETRY_AFTER_MS,
            },
            { status: 202 }
        );
    }

    if (!isSuccess) {
        return Response.json(
            {
                code: 'ASSEMBLY_UNKNOWN_STATUS',
                assemblyId: parsed.assemblyId,
                status: status ?? null,
                message: 'Assembly reached an unknown non-success state.',
            },
            { status: 409 }
        );
    }

    const resolved = resolveAssemblyOutput(payload, parsed.type, { allowTemp: true });
    if (resolved.output) {
        if (process.env.NODE_ENV !== 'production') {
            console.info('[TRANSLOADIT_RESOLVE] persisting result', {
                assemblyId: parsed.assemblyId,
                sourceStep: resolved.output.sourceStep,
                sourceGroup: resolved.output.sourceGroup,
                isTempUrl: resolved.output.isTempUrl,
            });
        }

        const durable = await persistDurableAssetFromUrl({
            userId: user.id,
            uploadType: parsed.type,
            sourceUrl: resolved.output.url,
            assemblyId: parsed.assemblyId,
            existingMimeType: resolved.output.mimeType,
        });

        return Response.json(
            {
                assemblyId: parsed.assemblyId,
                url: durable.url,
                mimeType: durable.mimeType,
                outputType: parsed.type,
                isTempUrl: false,
                sourceStep: 'cloudinary',
                sourceGroup: 'cloudinary',
                provider: 'cloudinary',
                assetId: durable.asset.id,
                publicId: durable.publicId,
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
