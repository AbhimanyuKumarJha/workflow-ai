'use client';

import { useCallback, useEffect, useRef } from 'react';
import Uppy from '@uppy/core';
import Transloadit from '@uppy/transloadit';
import type { TransloaditUploadType } from '@/lib/transloadit';

const POLL_DELAY_MS = 2000;
const MAX_POLL_ATTEMPTS = 8;
const TRANSLOADIT_TERMINAL_OK_STATES = new Set([
    'ASSEMBLY_COMPLETED',
    'REQUEST_ABORTED',
    'ASSEMBLY_CANCELED',
    'ASSEMBLY_EXECUTION_REJECTED',
]);

interface TransloaditResultFile {
    ssl_url?: string;
    url?: string;
    mime?: string;
    type?: string;
    size?: number;
    bytes?: number;
    meta?: Record<string, unknown>;
}

interface TransloaditAssemblyLike {
    assembly_id?: string;
    ok?: string;
    error?: string;
    message?: string;
    results?: Record<string, TransloaditResultFile[]> | TransloaditResultFile[];
    uploads?: Record<string, TransloaditResultFile[]> | TransloaditResultFile[];
}

export interface TransloaditUploadMeta {
    provider: 'transloadit';
    assemblyId?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
}

interface UseTransloaditUploadOptions {
    /** Accepted file types, e.g. ['image/*'] or ['video/*'] */
    allowedFileTypes: string[];
    /** Upload template type */
    uploadType?: TransloaditUploadType;
    /** Called with the resulting CDN URL on success */
    onSuccess: (url: string, meta?: TransloaditUploadMeta) => void;
    /** Called on error */
    onError: (message: string) => void;
    /** Called when upload starts */
    onStart?: () => void;
}

/**
 * Hook that creates an Uppy instance with Transloadit for file uploads.
 * Returns a `triggerUpload` function that uploads the selected file.
 */
export function useTransloaditUpload({
    allowedFileTypes,
    uploadType,
    onSuccess,
    onError,
    onStart,
}: UseTransloaditUploadOptions) {
    const uppyRef = useRef<Uppy | null>(null);

    useEffect(() => {
        return () => {
            uppyRef.current?.destroy();
            uppyRef.current = null;
        };
    }, []);

    const resolveUploadType = useCallback((): TransloaditUploadType => {
        if (uploadType) {
            return uploadType;
        }

        return allowedFileTypes.some((entry) => entry.startsWith('video/')) ? 'video' : 'image';
    }, [allowedFileTypes, uploadType]);

    const triggerUpload = useCallback(
        (file: File) => {
            onStart?.();

            if (uppyRef.current) {
                uppyRef.current.destroy();
            }

            let didFinish = false;
            let latestAssemblyId: string | undefined;

            const uppy = new Uppy({
                restrictions: {
                    maxNumberOfFiles: 1,
                    allowedFileTypes,
                },
                autoProceed: true,
            });

            const finishWithError = (message: string) => {
                if (didFinish) {
                    return;
                }

                didFinish = true;
                onError(message);
                uppy.destroy();
                uppyRef.current = null;
            };

            const finishWithSuccess = (url: string, meta?: TransloaditUploadMeta) => {
                if (didFinish) {
                    return;
                }

                didFinish = true;
                onSuccess(url, meta);
                uppy.destroy();
                uppyRef.current = null;
            };

            uppy.use(Transloadit, {
                assemblyOptions: async () => {
                    const response = await fetch(
                        `/api/transloadit/assembly-options?type=${resolveUploadType()}`,
                        {
                            method: 'GET',
                            cache: 'no-store',
                        }
                    );

                    const payload = (await response.json().catch(() => null)) as
                        | {
                            params?: unknown;
                            signature?: unknown;
                            error?: unknown;
                        }
                        | null;

                    if (!response.ok) {
                        const reason =
                            typeof payload?.error === 'string'
                                ? payload.error
                                : 'Unable to load Transloadit assembly options';
                        throw new Error(reason);
                    }

                    if (!payload || typeof payload.params !== 'object' || payload.params === null) {
                        throw new Error('Invalid Transloadit assembly options response');
                    }

                    return {
                        params: payload.params as Record<string, unknown>,
                        signature:
                            typeof payload.signature === 'string' ? payload.signature : undefined,
                    };
                },
                waitForEncoding: true,
            });

            const normalizeResultFiles = (group: unknown): TransloaditResultFile[] => {
                if (!group) {
                    return [];
                }

                if (Array.isArray(group)) {
                    return group.filter(
                        (entry): entry is TransloaditResultFile =>
                            typeof entry === 'object' && entry !== null
                    );
                }

                if (typeof group !== 'object') {
                    return [];
                }

                const flattened: TransloaditResultFile[] = [];
                for (const value of Object.values(group)) {
                    if (Array.isArray(value)) {
                        flattened.push(
                            ...value.filter(
                                (entry): entry is TransloaditResultFile =>
                                    typeof entry === 'object' && entry !== null
                            )
                        );
                        continue;
                    }

                    if (typeof value === 'object' && value !== null) {
                        flattened.push(value as TransloaditResultFile);
                    }
                }

                return flattened;
            };

            const pickFirstUrl = (assembly: TransloaditAssemblyLike) => {
                const files = [
                    ...normalizeResultFiles(assembly.results),
                    ...normalizeResultFiles(assembly.uploads),
                ];

                for (const fileResult of files) {
                    const url = fileResult.ssl_url ?? fileResult.url;
                    if (typeof url === 'string' && url.length > 0) {
                        return { url, fileResult };
                    }
                }

                return null;
            };

            const toNumber = (...values: unknown[]): number | undefined => {
                for (const value of values) {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                        return value;
                    }

                    if (typeof value === 'string') {
                        const parsed = Number(value);
                        if (Number.isFinite(parsed)) {
                            return parsed;
                        }
                    }
                }

                return undefined;
            };

            const buildMeta = (
                assemblyId: string | undefined,
                fileResult: TransloaditResultFile
            ): TransloaditUploadMeta => {
                const fileMeta =
                    fileResult.meta && typeof fileResult.meta === 'object' ? fileResult.meta : {};
                const width = toNumber(
                    (fileMeta as Record<string, unknown>).width,
                    (fileMeta as Record<string, unknown>).image_width
                );
                const height = toNumber(
                    (fileMeta as Record<string, unknown>).height,
                    (fileMeta as Record<string, unknown>).image_height
                );
                const rawDurationMs = toNumber(
                    (fileMeta as Record<string, unknown>).duration_ms,
                    (fileMeta as Record<string, unknown>).durationMs
                );
                const rawDurationSeconds = toNumber(
                    (fileMeta as Record<string, unknown>).duration,
                    (fileMeta as Record<string, unknown>).duration_seconds
                );

                return {
                    provider: 'transloadit',
                    assemblyId,
                    mimeType: fileResult.mime ?? fileResult.type,
                    bytes: toNumber(fileResult.bytes, fileResult.size),
                    width,
                    height,
                    durationMs:
                        rawDurationMs ??
                        (rawDurationSeconds !== undefined ? Math.round(rawDurationSeconds * 1000) : undefined),
                };
            };

            const fetchAssemblyStatus = async (
                assemblyId: string
            ): Promise<TransloaditAssemblyLike | null> => {
                const response = await fetch(`/api/transloadit/assemblies/${assemblyId}`, {
                    method: 'GET',
                    cache: 'no-store',
                });

                const payload = (await response.json().catch(() => null)) as
                    | {
                        error?: unknown;
                    }
                    | TransloaditAssemblyLike
                    | null;

                if (!response.ok) {
                    const reason =
                        payload && typeof payload === 'object' && 'error' in payload
                            ? payload.error
                            : null;
                    throw new Error(
                        typeof reason === 'string'
                            ? reason
                            : `Failed to fetch assembly status (${response.status})`
                    );
                }

                if (!payload || typeof payload !== 'object') {
                    return null;
                }

                return payload as TransloaditAssemblyLike;
            };

            const getResultWithPolling = async (assemblyId: string) => {
                for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
                    const assembly = await fetchAssemblyStatus(assemblyId);
                    if (!assembly) {
                        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
                        continue;
                    }

                    const directResult = pickFirstUrl(assembly);
                    if (directResult) {
                        return { assembly, ...directResult };
                    }

                    if (assembly.error) {
                        throw new Error(
                            typeof assembly.message === 'string'
                                ? assembly.message
                                : typeof assembly.error === 'string'
                                    ? assembly.error
                                    : 'Transloadit assembly failed'
                        );
                    }

                    if (assembly.ok && TRANSLOADIT_TERMINAL_OK_STATES.has(assembly.ok)) {
                        return null;
                    }

                    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
                }

                return null;
            };

            uppy.on('transloadit:assembly-created', (assembly) => {
                if (assembly?.assembly_id) {
                    latestAssemblyId = assembly.assembly_id;
                }
            });

            uppy.on('transloadit:error', (_assembly, error) => {
                const message =
                    error instanceof Error
                        ? error.message
                        : typeof error === 'string'
                            ? error
                            : 'Transloadit upload failed';
                finishWithError(message);
            });

            uppy.on('upload-error', (_file, error) => {
                finishWithError(error?.message ?? 'Upload failed');
            });

            uppy.on('transloadit:complete', async (assembly) => {
                const assemblyData = (assembly ?? {}) as TransloaditAssemblyLike;
                const assemblyId = assemblyData.assembly_id ?? latestAssemblyId;
                const directResult = pickFirstUrl(assemblyData);

                if (directResult) {
                    finishWithSuccess(
                        directResult.url,
                        buildMeta(assemblyId, directResult.fileResult)
                    );
                    return;
                }

                if (assemblyId) {
                    try {
                        const polled = await getResultWithPolling(assemblyId);
                        if (polled) {
                            finishWithSuccess(
                                polled.url,
                                buildMeta(
                                    polled.assembly.assembly_id ?? assemblyId,
                                    polled.fileResult
                                )
                            );
                            return;
                        }
                    } catch (error) {
                        const message =
                            error instanceof Error ? error.message : 'Failed to fetch upload result';
                        finishWithError(message);
                        return;
                    }
                }

                finishWithError('Upload finished, but no result URL was returned by Transloadit');
            });

            uppy.on('error', (error) => {
                finishWithError(error?.message ?? 'Upload failed');
            });

            uppyRef.current = uppy;

            try {
                uppy.addFile({
                    name: file.name,
                    type: file.type,
                    data: file,
                });
            } catch (err) {
                finishWithError(err instanceof Error ? err.message : 'Failed to start upload');
            }
        },
        [allowedFileTypes, onSuccess, onError, onStart, resolveUploadType]
    );

    return { triggerUpload };
}
