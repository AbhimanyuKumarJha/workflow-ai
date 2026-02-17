import { GoogleGenerativeAI } from '@google/generative-ai';
import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

const payloadSchema = z.object({
    model: z.string().trim().min(1),
    systemPrompt: z.string().trim().optional(),
    userMessage: z.string().trim().min(1),
    imageUrls: z.array(z.string().url()).default([]).optional(),
});

function detectMimeType(url: string): string {
    const lower = url.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isUnsupportedOrRateLimited(error: unknown): boolean {
    const message = errorMessage(error).toLowerCase();
    return (
        ((message.includes('404') && message.includes('not found')) ||
            message.includes('not supported for generatecontent')) ||
        message.includes('429') ||
        message.includes('too many requests') ||
        message.includes('quota exceeded')
    );
}

function llmCandidates(preferred: string): string[] {
    const candidates = [
        normalizeModelName(preferred),
        normalizeModelName(process.env.GOOGLE_LLM_MODEL),
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-3-pro-preview',
    ].filter((value): value is string => Boolean(value));

    return [...new Set(candidates)];
}

export const llmTask = task({
    id: 'llm-execute',
    run: async (input: unknown) => {
        triggerDevLog('llm-execute', 'run.start');

        try {
            const payload = payloadSchema.parse(input);
            const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
            const candidates = llmCandidates(payload.model);

            if (!apiKey) {
                throw new Error('GOOGLE_AI_API_KEY (or GOOGLE_API_KEY) is not configured');
            }

            const client = new GoogleGenerativeAI(apiKey);

            const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

            for (const url of payload.imageUrls ?? []) {
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
            }

            parts.push({ text: payload.userMessage });

            let lastError: unknown;

            for (const modelName of candidates) {
                triggerDevLog('llm-execute', 'model.attempt', { model: modelName });

                try {
                    const model = client.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent({
                        contents: [{ role: 'user', parts }],
                        ...(payload.systemPrompt ? { systemInstruction: payload.systemPrompt } : {}),
                    });

                    const output = {
                        text: result.response.text(),
                        model: modelName,
                    };

                    triggerDevLog('llm-execute', 'run.success', { model: modelName });
                    return output;
                } catch (error) {
                    lastError = error;
                    triggerDevLog('llm-execute', 'model.error', {
                        model: modelName,
                        error: errorMessage(error),
                    });

                    if (isUnsupportedOrRateLimited(error)) {
                        continue;
                    }

                    throw error;
                }
            }

            throw new Error(
                `LLM failed for all candidate models (${candidates.join(', ')}). Last error: ${errorMessage(lastError)}`
            );
        } catch (error) {
            triggerDevLog('llm-execute', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
