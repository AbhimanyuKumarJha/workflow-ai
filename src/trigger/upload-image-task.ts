import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

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
        triggerDevLog('upload-image-passthrough', 'run.start');

        try {
            const payload = payloadSchema.parse(input);

            if (!payload.imageUrl) {
                throw new Error('No image has been uploaded');
            }

            const output = {
                imageUrl: payload.imageUrl,
                assetId: payload.assetId ?? null,
                mimeType: payload.mimeType ?? null,
                width: payload.width ?? null,
                height: payload.height ?? null,
            };

            triggerDevLog('upload-image-passthrough', 'run.success');
            return output;
        } catch (error) {
            triggerDevLog('upload-image-passthrough', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
