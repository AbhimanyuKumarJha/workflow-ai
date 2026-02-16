'use client';

import { useCallback, useRef } from 'react';
import Uppy from '@uppy/core';
import Transloadit from '@uppy/transloadit';

interface UseTransloaditUploadOptions {
    /** Accepted file types, e.g. ['image/*'] or ['video/*'] */
    allowedFileTypes: string[];
    /** Transloadit template ID override (defaults to env vars) */
    templateId?: string;
    /** Called with the resulting CDN URL on success */
    onSuccess: (url: string, meta?: Record<string, unknown>) => void;
    /** Called on error */
    onError: (message: string) => void;
    /** Called when upload starts */
    onStart?: () => void;
}

/**
 * Hook that creates an Uppy instance with Transloadit for file uploads.
 * Returns a `triggerUpload` function that opens a file picker and uploads.
 * Falls back to local blob URLs when Transloadit env vars are missing.
 */
export function useTransloaditUpload({
    allowedFileTypes,
    templateId,
    onSuccess,
    onError,
    onStart,
}: UseTransloaditUploadOptions) {
    const uppyRef = useRef<Uppy | null>(null);

    const triggerUpload = useCallback(
        (file: File) => {
            const authKey = process.env.NEXT_PUBLIC_TRANSLOADIT_AUTH_KEY;
            const resolvedTemplate =
                templateId ?? process.env.NEXT_PUBLIC_TRANSLOADIT_TEMPLATE_ID;

            // Fallback: no Transloadit credentials — use local blob URL
            if (!authKey || !resolvedTemplate) {
                onStart?.();
                const localUrl = URL.createObjectURL(file);
                onSuccess(localUrl, { local: true });
                return;
            }

            onStart?.();

            // Clean up previous instance
            if (uppyRef.current) {
                uppyRef.current.destroy();
            }

            const uppy = new Uppy({
                restrictions: {
                    maxNumberOfFiles: 1,
                    allowedFileTypes,
                },
                autoProceed: true,
            });

            uppy.use(Transloadit, {
                assemblyOptions: {
                    params: {
                        auth: { key: authKey },
                        template_id: resolvedTemplate,
                    },
                },
                waitForEncoding: true,
            });

            uppy.on('transloadit:complete', (assembly) => {
                // Extract the first result URL from the assembly
                const results = assembly?.results;
                if (results) {
                    for (const stepName of Object.keys(results)) {
                        const files = results[stepName];
                        if (Array.isArray(files) && files.length > 0) {
                            const resultFile = files[0] as { ssl_url?: string; url?: string };
                            const url = resultFile.ssl_url || resultFile.url;
                            if (url) {
                                onSuccess(url);
                                uppy.destroy();
                                uppyRef.current = null;
                                return;
                            }
                        }
                    }
                }

                onError('Upload completed but no result URL found');
                uppy.destroy();
                uppyRef.current = null;
            });

            uppy.on('error', (error) => {
                onError(error?.message ?? 'Upload failed');
                uppy.destroy();
                uppyRef.current = null;
            });

            uppyRef.current = uppy;

            // Add the file and let autoProceed handle the rest
            try {
                uppy.addFile({
                    name: file.name,
                    type: file.type,
                    data: file,
                });
            } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed to start upload');
                uppy.destroy();
                uppyRef.current = null;
            }
        },
        [allowedFileTypes, templateId, onSuccess, onError, onStart]
    );

    return { triggerUpload };
}
