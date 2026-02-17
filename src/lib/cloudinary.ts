import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';
import { WorkflowError } from '@/lib/error-handler';
import type { TransloaditUploadType } from '@/lib/transloadit';

interface CloudinaryAsset {
    url: string;
    publicId: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    resourceType?: string;
    format?: string;
}

let didConfigure = false;

function getCloudinaryEnv() {
    return {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    };
}

export function isCloudinaryConfigured(): boolean {
    const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
    return Boolean(cloudName && apiKey && apiSecret);
}

function configureCloudinaryOrThrow() {
    if (didConfigure) {
        return;
    }

    const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
    if (!cloudName || !apiKey || !apiSecret) {
        throw new WorkflowError(
            'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
            'CLOUDINARY_NOT_CONFIGURED',
            500
        );
    }

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });

    didConfigure = true;
}

function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

export async function uploadRemoteToCloudinary(params: {
    sourceUrl: string;
    uploadType: TransloaditUploadType;
    assemblyId?: string;
    preferredPublicId?: string;
}): Promise<CloudinaryAsset> {
    configureCloudinaryOrThrow();

    const resourceType = params.uploadType === 'video' ? 'video' : 'image';
    const options: UploadApiOptions = {
        resource_type: resourceType,
        folder: `workflow-ai/${params.uploadType}`,
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: params.assemblyId ? `assembly_id=${params.assemblyId}` : undefined,
        public_id: params.preferredPublicId,
    };

    const uploaded = await cloudinary.uploader.upload(params.sourceUrl, options);
    const durationSeconds = toNumber(uploaded.duration);

    return {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        bytes: toNumber(uploaded.bytes),
        width: toNumber(uploaded.width),
        height: toNumber(uploaded.height),
        durationMs:
            durationSeconds !== undefined ? Math.round(durationSeconds * 1000) : undefined,
        resourceType:
            typeof uploaded.resource_type === 'string' ? uploaded.resource_type : undefined,
        format: typeof uploaded.format === 'string' ? uploaded.format : undefined,
    };
}

