import { GoogleGenerativeAI } from '@google/generative-ai';
import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

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

export const llmTask = task({
    id: 'llm-execute',
    run: async (input: unknown) => {
        const payload = payloadSchema.parse(input);
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY is not configured');
        }

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({ model: payload.model });

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

        const result = await model.generateContent({
            contents: [{ role: 'user', parts }],
            ...(payload.systemPrompt ? { systemInstruction: payload.systemPrompt } : {}),
        });

        return {
            text: result.response.text(),
        };
    },
});
