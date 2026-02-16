import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

const payloadSchema = z.object({
    value: z.string().default(''),
});

export const textTask = task({
    id: 'text-passthrough',
    run: async (input: unknown) => {
        const payload = payloadSchema.parse(input);

        return {
            text: payload.value,
            value: payload.value,
        };
    },
});
