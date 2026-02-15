import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { task } from '@trigger.dev/sdk/v3';
import { Transloadit } from 'transloadit';
import { z } from 'zod';

const payloadSchema = z.object({
    videoUrl: z.string().url(),
    timestamp: z.union([z.string(), z.number()]).default(0),
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

function parseClockToSeconds(value: string): number | null {
    const segments = value.split(':').map((segment) => Number(segment));
    if (segments.some((segment) => !Number.isFinite(segment))) {
        return null;
    }

    if (segments.length === 3) {
        return segments[0] * 3600 + segments[1] * 60 + segments[2];
    }

    if (segments.length === 2) {
        return segments[0] * 60 + segments[1];
    }

    if (segments.length === 1) {
        return segments[0];
    }

    return null;
}

function resolveSeekSeconds(timestamp: string | number, durationSeconds: number): number {
    if (typeof timestamp === 'number') {
        if (Number.isFinite(timestamp)) {
            return Math.max(0, timestamp);
        }
        return 0;
    }

    const raw = timestamp.trim();
    if (raw.endsWith('%')) {
        const percentage = Number(raw.slice(0, -1));
        if (Number.isFinite(percentage)) {
            return Math.max(0, (durationSeconds * percentage) / 100);
        }
    }

    const clockSeconds = parseClockToSeconds(raw);
    if (clockSeconds !== null) {
        return Math.max(0, clockSeconds);
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        return Math.max(0, numeric);
    }

    return 0;
}

export const extractFrameTask = task({
    id: 'extract-frame',
    run: async (input: unknown) => {
        const payload = payloadSchema.parse(input);
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-frame-'));
        const inputPath = path.join(tempDir, 'input.mp4');
        const outputPath = path.join(tempDir, 'frame.jpg');

        try {
            const response = await fetch(payload.videoUrl);
            if (!response.ok) {
                throw new Error(`Failed to download video: ${response.status}`);
            }

            const bytes = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(inputPath, bytes);

            const durationProbe = await execa('ffprobe', [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                inputPath,
            ]);

            const durationSeconds = Number(durationProbe.stdout.trim());
            const seekSeconds = resolveSeekSeconds(
                payload.timestamp,
                Number.isFinite(durationSeconds) ? durationSeconds : 0
            );

            await execa('ffmpeg', [
                '-y',
                '-ss',
                String(seekSeconds),
                '-i',
                inputPath,
                '-frames:v',
                '1',
                '-q:v',
                '2',
                outputPath,
            ]);

            const authKey = process.env.NEXT_PUBLIC_TRANSLOADIT_AUTH_KEY;
            const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
            const templateId = process.env.TRANSLOADIT_TEMPLATE_ID_IMAGE;

            if (!authKey || !authSecret || !templateId) {
                return {
                    frameUrl: payload.videoUrl,
                    extractedFrameUrl: payload.videoUrl,
                    note: 'Returned source video URL because Transloadit credentials are not configured.',
                };
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
            const frameUrl = uploadedUrl ?? payload.videoUrl;

            return {
                frameUrl,
                extractedFrameUrl: frameUrl,
            };
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    },
});
