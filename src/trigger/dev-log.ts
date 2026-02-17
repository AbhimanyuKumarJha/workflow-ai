const IS_DEV = process.env.NODE_ENV === 'development';

export function triggerDevLog(taskId: string, event: string, details?: Record<string, unknown>) {
    if (!IS_DEV) {
        return;
    }

    if (details) {
        console.log(`[trigger:${taskId}] ${event}`, details);
        return;
    }

    console.log(`[trigger:${taskId}] ${event}`);
}
