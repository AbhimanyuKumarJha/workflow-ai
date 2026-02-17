import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { task } from '@trigger.dev/sdk/v3';
import { Transloadit } from 'transloadit';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

const payloadSchema = z.object({
    imageUrl: z.string().url(),
    xPercent: z.number().min(0).max(100).default(0),
    yPercent: z.number().min(0).max(100).default(0),
    widthPercent: z.number().min(0.1).max(100).default(100),
    heightPercent: z.number().min(0.1).max(100).default(100),
});

function extractTransloaditUrl(assembly: unknown): string | undefined {
    if (typeof assembly !== 'object' || assembly === null) {
        return undefined;
    }

    const results = (assembly as { results?: Record<string, unknown[]> }).results;
    if (!results) {
        return undefined;
    }

    for (const key of Object.keys(results)) {
        const group = results[key];
        if (!Array.isArray(group) || group.length === 0) {
            continue;
        }

        const first = group[0] as { ssl_url?: string; url?: string };
        if (typeof first.ssl_url === 'string') {
            return first.ssl_url;
        }
        if (typeof first.url === 'string') {
            return first.url;
        }
    }

    return undefined;
}

export const cropImageTask = task({
    id: 'crop-image',
    run: async (input: unknown) => {
        triggerDevLog('crop-image', 'run.start');

        try {
            const payload = payloadSchema.parse(input);
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-crop-'));
            const inputPath = path.join(tempDir, 'input');
            const outputPath = path.join(tempDir, 'output.jpg');

            try {
                const response = await fetch(payload.imageUrl);
                if (!response.ok) {
                    throw new Error(`Failed to download image: ${response.status}`);
                }

                const bytes = Buffer.from(await response.arrayBuffer());
                await fs.writeFile(inputPath, bytes);

                const probe = await execa('ffprobe', [
                    '-v',
                    'error',
                    '-select_streams',
                    'v:0',
                    '-show_entries',
                    'stream=width,height',
                    '-of',
                    'csv=s=x:p=0',
                    inputPath,
                ]);

                const [width, height] = probe.stdout.trim().split('x').map(Number);
                if (!Number.isFinite(width) || !Number.isFinite(height)) {
                    throw new Error('Could not determine image dimensions');
                }

                const cropX = Math.max(0, Math.floor(width * (payload.xPercent / 100)));
                const cropY = Math.max(0, Math.floor(height * (payload.yPercent / 100)));
                const cropWidth = Math.max(1, Math.floor(width * (payload.widthPercent / 100)));
                const cropHeight = Math.max(1, Math.floor(height * (payload.heightPercent / 100)));

                await execa('ffmpeg', [
                    '-y',
                    '-i',
                    inputPath,
                    '-vf',
                    `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`,
                    outputPath,
                ]);

                const authKey =
                    process.env.TRANSLOADIT_AUTH_KEY ?? process.env.NEXT_PUBLIC_TRANSLOADIT_AUTH_KEY;
                const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
                const templateId = process.env.TRANSLOADIT_TEMPLATE_ID_IMAGE;

                if (!authKey || !authSecret || !templateId) {
                    const output = {
                        croppedUrl: payload.imageUrl,
                        note: 'Returned source image because Transloadit credentials are not configured.',
                    };
                    triggerDevLog('crop-image', 'run.success');
                    return output;
                }

                const transloadit = new Transloadit({
                    authKey,
                    authSecret,
                });

                const assembly = await transloadit.createAssembly({
                    files: {
                        file: outputPath,
                    },
                    params: {
                        template_id: templateId,
                    },
                    waitForCompletion: true,
                });

                const uploadedUrl = extractTransloaditUrl(assembly);
                const output = {
                    croppedUrl: uploadedUrl ?? payload.imageUrl,
                };
                triggerDevLog('crop-image', 'run.success');
                return output;
            } finally {
                await fs.rm(tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            triggerDevLog('crop-image', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
