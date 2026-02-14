'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
    return (
        <SonnerToaster
            position="top-right"
            richColors
            toastOptions={{
                classNames: {
                    toast: 'bg-gray-900 border border-gray-700 text-white',
                    title: 'text-white',
                    description: 'text-gray-300',
                },
            }}
        />
    );
}
