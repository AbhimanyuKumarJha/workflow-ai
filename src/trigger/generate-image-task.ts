import { GoogleGenerativeAI } from '@google/generative-ai';
import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

const payloadSchema = z.object({
    model: z.string().trim().optional(),
    prompt: z.string().trim().min(1),
    referenceAUrl: z.string().url().optional(),
    referenceBUrl: z.string().url().optional(),
});

function detectMimeType(url: string): string {
    const lower = url.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}

interface InlineImagePart {
    inlineData?: {
        data?: string;
        mimeType?: string;
    };
}

function getFirstInlineImageFromResponse(response: unknown): { data: string; mimeType: string } | null {
    if (!response || typeof response !== 'object') {
        return null;
    }

    const candidates = (response as { candidates?: unknown }).candidates;
    if (!Array.isArray(candidates)) {
        return null;
    }

    for (const candidate of candidates) {
        const parts =
            candidate &&
                typeof candidate === 'object' &&
                typeof (candidate as { content?: unknown }).content === 'object'
                ? ((candidate as { content?: { parts?: unknown } }).content?.parts ?? [])
                : [];

        if (!Array.isArray(parts)) {
            continue;
        }

        for (const part of parts as InlineImagePart[]) {
            const data = part.inlineData?.data;
            if (typeof data === 'string' && data.length > 0) {
                return {
                    data,
                    mimeType: part.inlineData?.mimeType || 'image/png',
                };
            }
        }
    }

    return null;
}

function normalizeModelName(model?: string | null): string | undefined {
    if (!model) {
        return undefined;
    }

    const trimmed = model.trim();
    if (!trimmed) {
        return undefined;
    }

    return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

function extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isUnsupportedModelError(error: unknown): boolean {
    const message = extractErrorMessage(error).toLowerCase();
    return (
        (message.includes('404') && message.includes('not found')) ||
        message.includes('not supported for generatecontent')
    );
}

function isRateLimitOrQuotaError(error: unknown): boolean {
    const message = extractErrorMessage(error).toLowerCase();
    return (
        message.includes('429') ||
        message.includes('too many requests') ||
        message.includes('quota exceeded') ||
        message.includes('retry in')
    );
}

function buildImageModelCandidates(preferred?: string, envDefault?: string): string[] {
    const candidates = [
        normalizeModelName(preferred),
        normalizeModelName(envDefault),
        'gemini-2.5-flash-image',
        'gemini-3-pro-image-preview',
        'gemini-2.0-flash',
    ].filter((value): value is string => Boolean(value));

    return [...new Set(candidates)];
}

export const generateImageTask = task({
    id: 'generate-image',
    run: async (input: unknown) => {
        triggerDevLog('generate-image', 'run.start');

        try {
            const payload = payloadSchema.parse(input);
            const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
            const candidateModels = buildImageModelCandidates(
                payload.model,
                process.env.GOOGLE_IMAGE_MODEL
            );

            if (!apiKey) {
                throw new Error('GOOGLE_AI_API_KEY (or GOOGLE_API_KEY) is not configured');
            }

            const client = new GoogleGenerativeAI(apiKey);

            const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

            const referenceUrls = [payload.referenceAUrl, payload.referenceBUrl].filter(
                (url): url is string => Boolean(url)
            );

            for (const url of referenceUrls) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        continue;
                    }

                    const bytes = Buffer.from(await response.arrayBuffer());
                    parts.push({
                        inlineData: {
                            data: bytes.toString('base64'),
                            mimeType: detectMimeType(url),
                        },
                    });
                } catch {
                    continue;
                }
            }

            parts.push({
                text:
                    referenceUrls.length > 0
                        ? `Use the reference image(s) to generate or edit an image. Prompt: ${payload.prompt}`
                        : payload.prompt,
            });

            let lastError: unknown;

            for (const modelName of candidateModels) {
                triggerDevLog('generate-image', 'model.attempt', { model: modelName });

                try {
                    const model = client.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent({
                        contents: [{ role: 'user', parts }],
                    });

                    const inlineImage = getFirstInlineImageFromResponse(result.response);
                    if (!inlineImage) {
                        lastError = new Error(
                            `Model "${modelName}" did not return inline image data`
                        );
                        triggerDevLog('generate-image', 'model.no-inline-image', { model: modelName });
                        continue;
                    }

                    const output = {
                        generatedImageDataUrl: `data:${inlineImage.mimeType};base64,${inlineImage.data}`,
                        mimeType: inlineImage.mimeType,
                        model: modelName,
                    };

                    triggerDevLog('generate-image', 'run.success', { model: modelName });
                    return output;
                } catch (error) {
                    lastError = error;
                    triggerDevLog('generate-image', 'model.error', {
                        model: modelName,
                        error: extractErrorMessage(error),
                    });

                    if (isUnsupportedModelError(error) || isRateLimitOrQuotaError(error)) {
                        continue;
                    }

                    throw error;
                }
            }

            const attempted = candidateModels.join(', ');
            throw new Error(
                `Image generation failed for all candidate models (${attempted}). Last error: ${extractErrorMessage(
                    lastError
                )}`
            );
        } catch (error) {
            triggerDevLog('generate-image', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
