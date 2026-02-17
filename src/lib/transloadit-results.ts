import type { TransloaditUploadType } from '@/lib/transloadit';

export interface TransloaditResultFile {
    ssl_url?: string;
    url?: string;
    secure_url?: string;
    mime?: string;
    type?: string;
    size?: number;
    bytes?: number;
    meta?: Record<string, unknown>;
    is_temp_url?: boolean;
}

export interface TransloaditAssemblyLike {
    assembly_id?: string;
    ok?: string;
    error?: string;
    message?: string;
    results?: Record<string, TransloaditResultFile[]> | TransloaditResultFile[];
    uploads?: Record<string, TransloaditResultFile[]> | TransloaditResultFile[];
}

export interface FlattenedTransloaditFile {
    sourceStep: string;
    file: TransloaditResultFile;
}

export interface ResolvedAssemblyOutput {
    url: string;
    mimeType?: string;
    outputType?: string;
    isTempUrl?: boolean;
    sourceStep: string;
    sourceGroup: 'results' | 'uploads';
}

function getUrl(file: TransloaditResultFile): string | undefined {
    const url = file.ssl_url ?? file.secure_url ?? file.url;
    return typeof url === 'string' && url.length > 0 ? url : undefined;
}

export function isCloudinaryUrl(url: string): boolean {
    return /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}

function inferFromUrl(url: string): 'image' | 'video' | undefined {
    const lower = url.toLowerCase();

    if (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.avif')
    ) {
        return 'image';
    }

    if (
        lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.m4v') ||
        lower.endsWith('.avi') ||
        lower.endsWith('.mkv')
    ) {
        return 'video';
    }

    return undefined;
}

export function matchesUploadType(
    uploadType: TransloaditUploadType,
    file: TransloaditResultFile
): boolean {
    const mime = typeof file.mime === 'string' ? file.mime.toLowerCase() : '';
    const rawType = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    const url = getUrl(file);
    const inferred = url ? inferFromUrl(url) : undefined;

    if (uploadType === 'image') {
        return (
            mime.startsWith('image/') || rawType === 'image' || inferred === 'image'
        );
    }

    return mime.startsWith('video/') || rawType === 'video' || inferred === 'video';
}

export function flattenResultGroup(
    group: TransloaditAssemblyLike['results'] | TransloaditAssemblyLike['uploads']
): FlattenedTransloaditFile[] {
    if (!group) {
        return [];
    }

    const flattened: FlattenedTransloaditFile[] = [];

    if (Array.isArray(group)) {
        for (const entry of group) {
            if (entry && typeof entry === 'object') {
                flattened.push({
                    sourceStep: ':array',
                    file: entry,
                });
            }
        }
        return flattened;
    }

    if (typeof group !== 'object') {
        return [];
    }

    for (const [key, value] of Object.entries(group)) {
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (entry && typeof entry === 'object') {
                    flattened.push({
                        sourceStep: key,
                        file: entry,
                    });
                }
            }
            continue;
        }

        if (value && typeof value === 'object') {
            flattened.push({
                sourceStep: key,
                file: value as TransloaditResultFile,
            });
        }
    }

    return flattened;
}

export function resolveAssemblyOutputFromResults(
    assembly: TransloaditAssemblyLike,
    uploadType: TransloaditUploadType,
    options?: {
        allowTemp?: boolean;
    }
): { output?: ResolvedAssemblyOutput; hasWrongType: boolean } {
    const candidates = flattenResultGroup(assembly.results);
    let hasWrongType = false;
    const allowTemp = options?.allowTemp ?? false;

    for (const candidate of candidates) {
        const url = getUrl(candidate.file);
        if (!url) {
            continue;
        }

        if (!matchesUploadType(uploadType, candidate.file)) {
            hasWrongType = true;
            continue;
        }

        if (!allowTemp && candidate.file.is_temp_url === true) {
            continue;
        }

        return {
            output: {
                url,
                mimeType: candidate.file.mime,
                outputType: candidate.file.type,
                isTempUrl: candidate.file.is_temp_url,
                sourceStep: candidate.sourceStep,
                sourceGroup: 'results',
            },
            hasWrongType,
        };
    }

    return { hasWrongType };
}

export function resolveAssemblyOutput(
    assembly: TransloaditAssemblyLike,
    uploadType: TransloaditUploadType,
    options?: {
        allowTemp?: boolean;
    }
): { output?: ResolvedAssemblyOutput; hasWrongType: boolean } {
    const allowTemp = options?.allowTemp ?? true;
    const resolvedFromResults = resolveAssemblyOutputFromResults(assembly, uploadType, {
        allowTemp,
    });

    if (resolvedFromResults.output) {
        return resolvedFromResults;
    }

    let hasWrongType = resolvedFromResults.hasWrongType;
    const uploads = flattenResultGroup(assembly.uploads);

    for (const candidate of uploads) {
        const url = getUrl(candidate.file);
        if (!url) {
            continue;
        }

        if (!matchesUploadType(uploadType, candidate.file)) {
            hasWrongType = true;
            continue;
        }

        if (!allowTemp && candidate.file.is_temp_url === true) {
            continue;
        }

        return {
            output: {
                url,
                mimeType: candidate.file.mime,
                outputType: candidate.file.type,
                isTempUrl: candidate.file.is_temp_url,
                sourceStep: candidate.sourceStep,
                sourceGroup: 'uploads',
            },
            hasWrongType,
        };
    }

    return { hasWrongType };
}

export function hasTempUploadsOnly(assembly: TransloaditAssemblyLike): boolean {
    const uploads = flattenResultGroup(assembly.uploads);
    if (uploads.length === 0) {
        return false;
    }

    return uploads.some((candidate) => candidate.file.is_temp_url === true);
}
