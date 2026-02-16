import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

const payloadSchema = z.object({
    imageUrl: z.string().url().nullable().optional(),
    assetId: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
});

export const uploadImageTask = task({
    id: 'upload-image-passthrough',
    run: async (input: unknown) => {
        const payload = payloadSchema.parse(input);

        if (!payload.imageUrl) {
            throw new Error('No image has been uploaded');
        }

        return {
            imageUrl: payload.imageUrl,
            assetId: payload.assetId ?? null,
            mimeType: payload.mimeType ?? null,
            width: payload.width ?? null,
            height: payload.height ?? null,
        };
    },
});
