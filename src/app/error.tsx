'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('App error:', error);
    }, [error]);

    return (
        <div className="h-screen flex items-center justify-center bg-background text-text-primary">
            <div className="text-center max-w-md">
                <AlertTriangle className="w-16 h-16 text-status-error mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
                <p className="text-text-secondary mb-4">{error.message}</p>
                <button
                    onClick={reset}
                    className="px-4 py-2 bg-accent-purple hover:bg-accent-purple-dark rounded-lg transition"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
