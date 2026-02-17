import { task } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { triggerDevLog } from './dev-log';

const payloadSchema = z.object({
    value: z.string().default(''),
});

export const textTask = task({
    id: 'text-passthrough',
    run: async (input: unknown) => {
        triggerDevLog('text-passthrough', 'run.start');

        try {
            const payload = payloadSchema.parse(input);
            const output = {
                text: payload.value,
                value: payload.value,
            };
            triggerDevLog('text-passthrough', 'run.success');
            return output;
        } catch (error) {
            triggerDevLog('text-passthrough', 'run.error', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },
});
