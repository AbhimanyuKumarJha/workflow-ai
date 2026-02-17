import { HandleDataType } from './types';

/**
 * Central registry mapping node types and their handles to data types.
 * This provides a single source of truth for connection validation.
 */

interface NodeHandles {
    [handleId: string]: HandleDataType;
}

interface HandleRegistry {
    [nodeType: string]: NodeHandles;
}

export const HANDLE_REGISTRY: HandleRegistry = {
    // Text node - outputs text only
    text: {
        output: 'text',
    },

    // Upload Image node - outputs image only
    upload_image: {
        output: 'image',
    },

    // Upload Video node - outputs video only
    upload_video: {
        output: 'video',
    },

    // LLM node - accepts text prompts and images, outputs text
    llm: {
        system_prompt: 'text',
        user_message: 'text',
        images: 'image', // can accept multiple
        output: 'text',
    },

    // Crop Image node - accepts image and text parameters, outputs image
    crop_image: {
        image_url: 'image',
        x_percent: 'text',
        y_percent: 'text',
        width_percent: 'text',
        height_percent: 'text',
        output: 'image',
    },

    // Extract Frame node - accepts video and timestamp, outputs image
    extract_frame: {
        video_url: 'video',
        timestamp: 'text',
        output: 'image',
    },

    // Generate Image node - accepts text prompt and optional image references, outputs image
    generate_image: {
        prompt: 'text',
        reference_a: 'image',
        reference_b: 'image',
        output: 'image',
    },

    // Export Text node - accepts text and terminates branch
    export_text: {
        text: 'text',
    },

    // Export Image node - accepts image and terminates branch
    export_image: {
        image: 'image',
    },

    // Export Video node - accepts video and terminates branch
    export_video: {
        video: 'video',
    },
};

/**
 * Get the data type for a specific handle on a node
 */
export function getHandleDataType(
    nodeType: string,
    handleId: string
): HandleDataType | undefined {
    return HANDLE_REGISTRY[nodeType]?.[handleId];
}

/**
 * Check if a connection between two handles is type-compatible
 */
export function areHandlesCompatible(
    sourceNodeType: string,
    sourceHandleId: string,
    targetNodeType: string,
    targetHandleId: string
): boolean {
    const sourceType = getHandleDataType(sourceNodeType, sourceHandleId);
    const targetType = getHandleDataType(targetNodeType, targetHandleId);

    if (!sourceType || !targetType) {
        return false;
    }

    // Strict type matching: text->text, image->image, video->video
    return sourceType === targetType;
}

/**
 * Get a human-readable label for a data type
 */
export function getDataTypeLabel(dataType: HandleDataType): string {
    const labels: Record<HandleDataType, string> = {
        text: 'Text',
        image: 'Image',
        video: 'Video',
    };
    return labels[dataType];
}
