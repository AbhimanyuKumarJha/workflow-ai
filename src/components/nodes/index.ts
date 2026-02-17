export { BaseNode, CustomHandle } from './BaseNode';
export { TextNode } from './TextNode';
export { UploadImageNode } from './UploadImageNode';
export { UploadVideoNode } from './UploadVideoNode';
export { LLMNode } from './LLMNode';
export { CropImageNode } from './CropImageNode';
export { ExtractFrameNode } from './ExtractFrameNode';
export { GenerateImageNode } from './GenerateImageNode';
export { ExportTextNode } from './ExportTextNode';
export { ExportImageNode } from './ExportImageNode';
export { ExportVideoNode } from './ExportVideoNode';

// Node types map for React Flow
export const nodeTypes = {
    text: TextNode,
    upload_image: UploadImageNode,
    upload_video: UploadVideoNode,
    llm: LLMNode,
    crop_image: CropImageNode,
    extract_frame: ExtractFrameNode,
    generate_image: GenerateImageNode,
    export_text: ExportTextNode,
    export_image: ExportImageNode,
    export_video: ExportVideoNode,
} as const;

// Re-export types
export type NodeTypeKey = keyof typeof nodeTypes;

// Node type labels for UI
export const nodeTypeLabels: Record<NodeTypeKey, string> = {
    text: 'Text Node',
    upload_image: 'Upload Image',
    upload_video: 'Upload Video',
    llm: 'Run Any LLM',
    crop_image: 'Crop Image',
    extract_frame: 'Extract Frame',
    generate_image: 'Generate Image',
    export_text: 'Export Text',
    export_image: 'Export Image',
    export_video: 'Export Video',
};

// Node type icons and colors for sidebar
export const nodeTypeConfig: Record<NodeTypeKey, { icon: string; color: string }> = {
    text: { icon: 'Type', color: 'text-node-text' },
    upload_image: { icon: 'ImageIcon', color: 'text-node-image' },
    upload_video: { icon: 'Video', color: 'text-node-video' },
    llm: { icon: 'Brain', color: 'text-node-llm' },
    crop_image: { icon: 'Crop', color: 'text-node-processing' },
    extract_frame: { icon: 'Film', color: 'text-node-processing' },
    generate_image: { icon: 'ImagePlus', color: 'text-node-image' },
    export_text: { icon: 'FileText', color: 'text-node-text' },
    export_image: { icon: 'ImageDown', color: 'text-node-image' },
    export_video: { icon: 'Video', color: 'text-node-video' },
};

// Import statements for nodes
import { TextNode } from './TextNode';
import { UploadImageNode } from './UploadImageNode';
import { UploadVideoNode } from './UploadVideoNode';
import { LLMNode } from './LLMNode';
import { CropImageNode } from './CropImageNode';
import { ExtractFrameNode } from './ExtractFrameNode';
import { GenerateImageNode } from './GenerateImageNode';
import { ExportTextNode } from './ExportTextNode';
import { ExportImageNode } from './ExportImageNode';
import { ExportVideoNode } from './ExportVideoNode';
