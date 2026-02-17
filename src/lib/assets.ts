import { Asset, AssetType } from '@prisma/client';
import { isCloudinaryConfigured, uploadRemoteToCloudinary } from '@/lib/cloudinary';
import { WorkflowError } from '@/lib/error-handler';
import { prisma } from '@/lib/prisma';
import type { TransloaditUploadType } from '@/lib/transloadit';
import { isCloudinaryUrl } from '@/lib/transloadit-results';

function toAssetType(uploadType: TransloaditUploadType): AssetType {
    return uploadType === 'video' ? AssetType.VIDEO : AssetType.IMAGE;
}

function buildMimeType(input: {
    uploadType: TransloaditUploadType;
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

interface PersistDurableAssetInput {
    userId: string;
    uploadType: TransloaditUploadType;
    sourceUrl: string;
    assemblyId?: string;
    existingMimeType?: string;
}

export interface PersistDurableAssetResult {
    asset: Asset;
    url: string;
    mimeType?: string;
    publicId?: string;
    provider: 'cloudinary';
    uploadType: TransloaditUploadType;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
}

export async function persistDurableAssetFromUrl(
    input: PersistDurableAssetInput
): Promise<PersistDurableAssetResult> {
    if (isCloudinaryUrl(input.sourceUrl)) {
        const existingByUrl = await prisma.asset.findFirst({
            where: {
                provider: 'cloudinary',
                url: input.sourceUrl,
            },
        });

        const persistedAsset =
            existingByUrl ??
            (await prisma.asset.create({
                data: {
                    userId: input.userId,
                    type: toAssetType(input.uploadType),
                    url: input.sourceUrl,
                    provider: 'cloudinary',
                    assemblyId: input.assemblyId,
                    mimeType: input.existingMimeType,
                },
            }));

        return {
            asset: persistedAsset,
            url: persistedAsset.url,
            mimeType: persistedAsset.mimeType ?? undefined,
            provider: 'cloudinary',
            uploadType: input.uploadType,
            bytes: persistedAsset.bytes ?? undefined,
            width: persistedAsset.width ?? undefined,
            height: persistedAsset.height ?? undefined,
            durationMs: persistedAsset.durationMs ?? undefined,
        };
    }

    if (!isCloudinaryConfigured()) {
        throw new WorkflowError(
            'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
            'CLOUDINARY_NOT_CONFIGURED',
            500
        );
    }

    const uploaded = await uploadRemoteToCloudinary({
        sourceUrl: input.sourceUrl,
        uploadType: input.uploadType,
        assemblyId: input.assemblyId,
    });

    const mimeType = buildMimeType({
        uploadType: input.uploadType,
        existingMimeType: input.existingMimeType,
        resourceType: uploaded.resourceType,
        format: uploaded.format,
    });

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
                userId: input.userId,
                type: toAssetType(input.uploadType),
                url: uploaded.url,
                provider: 'cloudinary',
                assemblyId: input.assemblyId,
                mimeType,
                bytes: uploaded.bytes,
                width: uploaded.width,
                height: uploaded.height,
                durationMs: uploaded.durationMs,
            },
        }));

    return {
        asset: persistedAsset,
        url: uploaded.url,
        mimeType,
        publicId: uploaded.publicId,
        provider: 'cloudinary',
        uploadType: input.uploadType,
        bytes: uploaded.bytes,
        width: uploaded.width,
        height: uploaded.height,
        durationMs: uploaded.durationMs,
    };
}

