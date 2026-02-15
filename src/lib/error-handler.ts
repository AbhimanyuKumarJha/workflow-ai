import { ZodError } from 'zod';

export class WorkflowError extends Error {
    constructor(
        message: string,
        public code: string,
        public status: number = 500,
        public details?: unknown
    ) {
        super(message);
        this.name = 'WorkflowError';
    }
}

export interface APIErrorShape {
    message: string;
    code: string;
    status: number;
    details?: unknown;
}

export function handleAPIError(error: unknown): APIErrorShape {
    if (error instanceof WorkflowError) {
        return {
            message: error.message,
            code: error.code,
            status: error.status,
            details: error.details,
        };
    }

    if (error instanceof ZodError) {
        return {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            status: 400,
            details: error.flatten(),
        };
    }

    if (error instanceof Error) {
        return {
            message: error.message,
            code: 'UNKNOWN_ERROR',
            status: 500,
        };
    }

    return {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        status: 500,
    };
}

export function withErrorHandler<TArgs extends unknown[]>(
    handler: (...args: TArgs) => Promise<Response>
) {
    return async (...args: TArgs): Promise<Response> => {
        try {
            return await handler(...args);
        } catch (error) {
            const { message, code, status, details } = handleAPIError(error);
            if (process.env.NODE_ENV !== 'production') {
                console.error('[API_ERROR]', error);
            }

            return Response.json(
                {
                    error: message,
                    code,
                    details,
                },
                { status }
            );
        }
    };
}
