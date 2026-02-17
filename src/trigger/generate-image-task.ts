import { GoogleGenerativeAI } from '@google/generative-ai';
import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

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

export const generateImageTask = task({
    id: 'generate-image',
    run: async (input: unknown) => {
        const payload = payloadSchema.parse(input);
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        const defaultModel = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.0-flash-exp';

        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY is not configured');
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: payload.model || defaultModel,
        });

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

        const result = await model.generateContent({
            contents: [{ role: 'user', parts }],
        });

        const inlineImage = getFirstInlineImageFromResponse(result.response);
        if (!inlineImage) {
            throw new Error(
                'Image model did not return inline image data. Try a Gemini image-capable model via GOOGLE_IMAGE_MODEL.'
            );
        }

        return {
            generatedImageDataUrl: `data:${inlineImage.mimeType};base64,${inlineImage.data}`,
            mimeType: inlineImage.mimeType,
        };
    },
});

