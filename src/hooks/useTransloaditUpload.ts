'use client';

import { useCallback, useEffect, useRef } from 'react';
import Uppy from '@uppy/core';
import Transloadit from '@uppy/transloadit';
import type { TransloaditParams, TransloaditUploadType } from '@/lib/transloadit';
import type { TransloaditResultFile } from '@/lib/transloadit-results';

const POLL_DELAY_MS = 1500;
const MAX_POLL_ATTEMPTS = 40;
const MAX_POLL_TOTAL_MS = 120_000;

export interface TransloaditUploadMeta {
    provider: 'transloadit' | 'cloudinary';
    assemblyId?: string;
    assetId?: string;
    publicId?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    isTempUrl?: boolean;
    sourceStep?: string;
    outputType?: string;
}

interface UseTransloaditUploadOptions {
    allowedFileTypes: string[];
    uploadType?: TransloaditUploadType;
    onSuccess: (url: string, meta?: TransloaditUploadMeta) => void;
    onError: (message: string) => void;
    onStart?: () => void;
}

interface ResolveApiSuccess {
    assemblyId: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    url: string;
    mimeType?: string;
    outputType?: string;
    isTempUrl?: boolean;
    sourceStep?: string;
}

interface ResolveApiError {
    code?: string;
    message?: string;
    error?: string;
}

function isResolveApiSuccess(payload: unknown): payload is ResolveApiSuccess {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    return typeof (payload as { url?: unknown }).url === 'string';
}

function isResolveApiError(payload: unknown): payload is ResolveApiError {
    return Boolean(payload) && typeof payload === 'object';
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(...values: unknown[]): number | undefined {
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
}

function buildMeta(
    assemblyId: string | undefined,
    fileResult: TransloaditResultFile | undefined,
    fallback?: {
        assetId?: string;
        publicId?: string;
        provider?: string;
        mimeType?: string;
        outputType?: string;
        isTempUrl?: boolean;
        sourceStep?: string;
    }
): TransloaditUploadMeta {
    const fileMeta =
        fileResult?.meta && typeof fileResult.meta === 'object' ? fileResult.meta : {};

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
        provider: fallback?.provider === 'cloudinary' ? 'cloudinary' : 'transloadit',
        assemblyId,
        assetId: fallback?.assetId,
        publicId: fallback?.publicId,
        mimeType: fallback?.mimeType ?? fileResult?.mime ?? fileResult?.type,
        outputType: fallback?.outputType ?? fileResult?.type,
        isTempUrl: fallback?.isTempUrl ?? fileResult?.is_temp_url,
        sourceStep: fallback?.sourceStep,
        bytes: toNumber(fileResult?.bytes, fileResult?.size),
        width,
        height,
        durationMs:
            rawDurationMs ??
            (rawDurationSeconds !== undefined ? Math.round(rawDurationSeconds * 1000) : undefined),
    };
}

function messageForWrongType(uploadType: TransloaditUploadType): string {
    if (uploadType === 'video') {
        return 'Upload succeeded, but template output is not a video file. Check TRANSLOADIT_TEMPLATE_ID_VIDEO steps/results.';
    }

    return 'Upload succeeded, but template output is not an image file. Check TRANSLOADIT_TEMPLATE_ID_IMAGE steps/results.';
}

function messageForNoCompatibleResult(): string {
    return 'Upload completed, but no compatible Transloadit output URL was found.';
}

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
            const resolvedUploadType = resolveUploadType();

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

            const resolveViaApi = async (assemblyId: string): Promise<ResolveApiSuccess> => {
                const startedAt = Date.now();

                for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
                    if (Date.now() - startedAt >= MAX_POLL_TOTAL_MS) {
                        throw new Error(
                            'Timed out while waiting for Transloadit result. The assembly did not reach a successful terminal state in time.'
                        );
                    }

                    const response = await fetch(
                        `/api/transloadit/resolve?assemblyId=${encodeURIComponent(assemblyId)}&type=${resolvedUploadType}`,
                        {
                            method: 'GET',
                            cache: 'no-store',
                        }
                    );

                    const payload = (await response.json().catch(() => null)) as
                        | ResolveApiSuccess
                        | ResolveApiError
                        | null;

                    if (response.ok && isResolveApiSuccess(payload)) {
                        return payload;
                    }

                    const code =
                        isResolveApiError(payload) && typeof payload.code === 'string'
                            ? payload.code
                            : undefined;

                    if (response.status === 202 && code === 'ASSEMBLY_IN_PROGRESS') {
                        await delay(POLL_DELAY_MS);
                        continue;
                    }

                    if (
                        response.status === 409 &&
                        (code === 'ASSEMBLY_TERMINAL_FAILURE' || code === 'ASSEMBLY_UNKNOWN_STATUS')
                    ) {
                        const message =
                            isResolveApiError(payload) && typeof payload.message === 'string'
                                ? payload.message
                                : 'Transloadit assembly did not complete successfully.';
                        throw new Error(message);
                    }

                    if (response.status === 422 && (code === 'VIDEO_RESULT_NOT_VIDEO' || code === 'IMAGE_RESULT_NOT_IMAGE')) {
                        throw new Error(messageForWrongType(resolvedUploadType));
                    }

                    if (
                        response.status === 409 &&
                        (code === 'NO_DURABLE_RESULT' || code === 'NO_COMPATIBLE_RESULT')
                    ) {
                        const message =
                            isResolveApiError(payload) && typeof payload.message === 'string'
                                ? payload.message
                                : messageForNoCompatibleResult();
                        throw new Error(message);
                    }

                    const message =
                        isResolveApiError(payload)
                            ? typeof payload.error === 'string'
                                ? payload.error
                                : typeof payload.message === 'string'
                                    ? payload.message
                                    : undefined
                            : undefined;

                    throw new Error(message ?? 'Failed to resolve Transloadit result');
                }

                throw new Error(
                    'Timed out while waiting for Transloadit result. The assembly may still be in progress.'
                );
            };

            uppy.use(Transloadit, {
                assemblyOptions: async () => {
                    const response = await fetch(
                        `/api/transloadit-signature?type=${resolvedUploadType}`,
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
                        params: payload.params as TransloaditParams,
                        signature:
                            typeof payload.signature === 'string' ? payload.signature : undefined,
                    };
                },
                waitForEncoding: true,
            });

            uppy.on('transloadit:assembly-created', (assembly) => {
                if (assembly?.assembly_id) {
                    latestAssemblyId = assembly.assembly_id;
                }
            });

            uppy.on('transloadit:assembly-error', (_assembly, error) => {
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
                const assemblyData = (assembly ?? {}) as { assembly_id?: string };
                const assemblyId = assemblyData.assembly_id ?? latestAssemblyId;

                if (!assemblyId) {
                    finishWithError('Upload finished, but no assembly ID was returned by Transloadit');
                    return;
                }

                try {
                    const resolved = await resolveViaApi(assemblyId);
                    finishWithSuccess(
                        resolved.url,
                        buildMeta(assemblyId, undefined, {
                            assetId: resolved.assetId,
                            publicId: resolved.publicId,
                            provider: resolved.provider,
                            mimeType: resolved.mimeType,
                            outputType: resolved.outputType,
                            isTempUrl: resolved.isTempUrl,
                            sourceStep: resolved.sourceStep,
                        })
                    );
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : 'Failed to resolve upload result';
                    finishWithError(message);
                }
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
