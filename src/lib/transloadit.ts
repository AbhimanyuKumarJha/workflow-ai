import crypto from 'node:crypto';

export type TransloaditUploadType = 'image' | 'video';

export interface TransloaditParams {
    auth: {
        key: string;
        expires: string;
    };
    template_id: string;
}

export interface SignedAssemblyOptions {
    params: TransloaditParams;
    signature?: string;
}

const DEFAULT_EXPIRY_SECONDS = 60 * 60;

function getExpirySeconds(): number {
    const raw = process.env.TRANSLOADIT_ASSEMBLY_OPTIONS_TTL_SECONDS;
    const parsed = raw ? Number(raw) : NaN;

    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }

    return DEFAULT_EXPIRY_SECONDS;
}

function getTemplateId(uploadType: TransloaditUploadType): string | undefined {
    if (uploadType === 'image') {
        return (
            process.env.TRANSLOADIT_TEMPLATE_ID_IMAGE ??
            process.env.NEXT_PUBLIC_TRANSLOADIT_TEMPLATE_ID_IMAGE
        );
    }

    return (
        process.env.TRANSLOADIT_TEMPLATE_ID_VIDEO ??
        process.env.NEXT_PUBLIC_TRANSLOADIT_TEMPLATE_ID_VIDEO
    );
}

export function buildSignedAssemblyOptions(uploadType: TransloaditUploadType): SignedAssemblyOptions {
    const authKey =
        process.env.TRANSLOADIT_AUTH_KEY ?? process.env.NEXT_PUBLIC_TRANSLOADIT_AUTH_KEY;
    const templateId = getTemplateId(uploadType);

    if (!authKey) {
        throw new Error(
            'Transloadit is not configured: set TRANSLOADIT_AUTH_KEY (or NEXT_PUBLIC_TRANSLOADIT_AUTH_KEY).'
        );
    }

    if (!templateId) {
        throw new Error(
            `Transloadit template is missing for ${uploadType} uploads. Set TRANSLOADIT_TEMPLATE_ID_${uploadType.toUpperCase()}.`
        );
    }

    const expiresAt = new Date(Date.now() + getExpirySeconds() * 1000);
    const params: TransloaditParams = {
        auth: {
            key: authKey,
            expires: expiresAt.toISOString(),
        },
        template_id: templateId,
    };

    const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
    if (!authSecret) {
        return { params };
    }

    const payload = JSON.stringify(params);
    const digest = crypto.createHmac('sha384', authSecret).update(payload).digest('hex');

    return {
        params,
        signature: `sha384:${digest}`,
    };
}
