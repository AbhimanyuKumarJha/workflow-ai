import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

const payloadSchema = z.object({
    videoUrl: z.string().url().nullable().optional(),
    assetId: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    durationMs: z.number().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
});

export const uploadVideoTask = task({
    id: 'upload-video-passthrough',
    run: async (input: unknown) => {
        triggerDevLog('upload-video-passthrough', 'run.start');

        try {
            const payload = payloadSchema.parse(input);

            if (!payload.videoUrl) {
                throw new Error('No video has been uploaded');
            }

            const output = {
                videoUrl: payload.videoUrl,
                assetId: payload.assetId ?? null,
                mimeType: payload.mimeType ?? null,
                durationMs: payload.durationMs ?? null,
                thumbnailUrl: payload.thumbnailUrl ?? null,
            };

            triggerDevLog('upload-video-passthrough', 'run.success');
            return output;
        } catch (error) {
            triggerDevLog('upload-video-passthrough', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
