import { areHandlesCompatible } from '@/lib/handle-registry';
import { CustomEdge, CustomNode } from '@/lib/types';

export type ExecutionScope = 'FULL' | 'SELECTED' | 'SINGLE';

function buildAdjacencyList(nodes: CustomNode[], edges: CustomEdge[]): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
        adjacency.set(node.id, []);
    }

    for (const edge of edges) {
        const neighbors = adjacency.get(edge.source) ?? [];
        neighbors.push(edge.target);
        adjacency.set(edge.source, neighbors);
    }

    return adjacency;
}

function buildReverseAdjacencyList(nodes: CustomNode[], edges: CustomEdge[]): Map<string, string[]> {
    const reverse = new Map<string, string[]>();

    for (const node of nodes) {
        reverse.set(node.id, []);
    }

    for (const edge of edges) {
        const parents = reverse.get(edge.target) ?? [];
        parents.push(edge.source);
        reverse.set(edge.target, parents);
    }

    return reverse;
}

export function validateDAG(nodes: CustomNode[], edges: CustomEdge[]): boolean {
    const adjacency = buildAdjacencyList(nodes, edges);
    const visited = new Set<string>();
    const stack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
        visited.add(nodeId);
        stack.add(nodeId);

        const neighbors = adjacency.get(nodeId) ?? [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor) && hasCycle(neighbor)) {
                return true;
            }

            if (stack.has(neighbor)) {
                return true;
            }
        }

        stack.delete(nodeId);
        return false;
    };

    for (const node of nodes) {
        if (!visited.has(node.id) && hasCycle(node.id)) {
            return false;
        }
    }

    return true;
}

export function topologicalSort(nodes: CustomNode[], edges: CustomEdge[]): CustomNode[] {
    const adjacency = buildAdjacencyList(nodes, edges);
    const inDegree = new Map<string, number>();
    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        inDegree.set(node.id, 0);
    }

    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const node of nodes) {
        if ((inDegree.get(node.id) ?? 0) === 0) {
            queue.push(node.id);
        }
    }

    const sorted: CustomNode[] = [];
    while (queue.length > 0) {
        const currentId = queue.shift() as string;
        const currentNode = byId.get(currentId);
        if (!currentNode) {
            continue;
        }

        sorted.push(currentNode);
        const neighbors = adjacency.get(currentId) ?? [];

        for (const neighborId of neighbors) {
            const nextDegree = (inDegree.get(neighborId) ?? 0) - 1;
            inDegree.set(neighborId, nextDegree);
            if (nextDegree === 0) {
                queue.push(neighborId);
            }
        }
    }

    if (sorted.length !== nodes.length) {
        throw new Error('Graph contains a cycle');
    }

    return sorted;
}

export function getExecutionLevels(nodes: CustomNode[], edges: CustomEdge[]): CustomNode[][] {
    const adjacency = buildAdjacencyList(nodes, edges);
    const inDegree = new Map<string, number>();
    const processed = new Set<string>();
    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        inDegree.set(node.id, 0);
    }

    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const levels: CustomNode[][] = [];

    while (processed.size < nodes.length) {
        const level: CustomNode[] = [];

        for (const node of nodes) {
            if (!processed.has(node.id) && (inDegree.get(node.id) ?? 0) === 0) {
                level.push(node);
            }
        }

        if (level.length === 0) {
            throw new Error('Graph contains a cycle');
        }

        for (const node of level) {
            processed.add(node.id);
            const neighbors = adjacency.get(node.id) ?? [];
            for (const neighborId of neighbors) {
                inDegree.set(neighborId, (inDegree.get(neighborId) ?? 0) - 1);
            }
        }

        levels.push(
            level
                .map((node) => byId.get(node.id))
                .filter((node): node is CustomNode => Boolean(node))
        );
    }

    return levels;
}

export function isValidConnection(
    sourceNodeType: string,
    targetNodeType: string,
    sourceHandle: string,
    targetHandle: string
): boolean {
    return areHandlesCompatible(sourceNodeType, sourceHandle, targetNodeType, targetHandle);
}

export function getSubgraphForScope(
    nodes: CustomNode[],
    edges: CustomEdge[],
    scope: ExecutionScope,
    selectedNodeIds: string[]
): { nodes: CustomNode[]; edges: CustomEdge[] } {
    if (scope === 'FULL') {
        return { nodes, edges };
    }

    const selected = new Set(selectedNodeIds);
    if (selected.size === 0) {
        return { nodes: [], edges: [] };
    }

    const reverse = buildReverseAdjacencyList(nodes, edges);
    const included = new Set<string>(selected);
    const queue = [...selected];

    // Include upstream dependencies so selected node runs can still resolve inputs.
    while (queue.length > 0) {
        const current = queue.shift() as string;
        const parents = reverse.get(current) ?? [];
        for (const parent of parents) {
            if (!included.has(parent)) {
                included.add(parent);
                queue.push(parent);
            }
        }
    }

    const filteredNodes = nodes.filter((node) => included.has(node.id));
    const filteredEdges = edges.filter(
        (edge) => included.has(edge.source) && included.has(edge.target)
    );

    return {
        nodes: filteredNodes,
        edges: filteredEdges,
    };
}

function toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
}

function getPrimaryOutputValue(sourceNode: CustomNode, output: Record<string, unknown>): unknown {
    switch (sourceNode.type) {
        case 'text':
            return output.text ?? output.value ?? sourceNode.data.value;
        case 'upload_image':
            return output.imageUrl ?? output.url ?? sourceNode.data.imageUrl;
        case 'upload_video':
            return output.videoUrl ?? output.url ?? sourceNode.data.videoUrl;
        case 'llm':
            return output.text ?? output.response ?? sourceNode.data.response;
        case 'crop_image':
            return output.croppedUrl ?? output.imageUrl ?? sourceNode.data.croppedUrl;
        case 'extract_frame':
            return output.frameUrl ?? output.extractedFrameUrl ?? sourceNode.data.extractedFrameUrl;
        default:
            return output;
    }
}

export function resolveNodeInputs(
    node: CustomNode,
    edges: CustomEdge[],
    nodeOutputs: Map<string, Record<string, unknown>>,
    allNodes: CustomNode[]
): Record<string, unknown> {
    const incomingEdges = edges.filter((edge) => edge.target === node.id);
    const inputs: Record<string, unknown> = {};

    for (const edge of incomingEdges) {
        const sourceNode = allNodes.find((candidate) => candidate.id === edge.source);
        if (!sourceNode || !edge.targetHandle) {
            continue;
        }

        const sourceOutput = nodeOutputs.get(edge.source) ?? {};
        const value = getPrimaryOutputValue(sourceNode, sourceOutput);

        if (edge.targetHandle === 'images') {
            const existing = (inputs.images as unknown[] | undefined) ?? [];
            if (value !== undefined && value !== null && value !== '') {
                inputs.images = [...existing, value];
            }
            continue;
        }

        inputs[edge.targetHandle] = value;
    }

    if (node.type === 'llm') {
        if (inputs.system_prompt === undefined) {
            inputs.system_prompt = node.data.systemPrompt;
        }
        if (inputs.user_message === undefined) {
            inputs.user_message = node.data.userMessage;
        }
        if (!Array.isArray(inputs.images)) {
            inputs.images = [];
        }
    }

    if (node.type === 'crop_image') {
        if (inputs.image_url === undefined) {
            inputs.image_url = node.data.imageUrl;
        }
        inputs.x_percent = toNumber(inputs.x_percent ?? node.data.xPercent, 0);
        inputs.y_percent = toNumber(inputs.y_percent ?? node.data.yPercent, 0);
        inputs.width_percent = toNumber(inputs.width_percent ?? node.data.widthPercent, 100);
        inputs.height_percent = toNumber(inputs.height_percent ?? node.data.heightPercent, 100);
    }

    if (node.type === 'extract_frame') {
        if (inputs.video_url === undefined) {
            inputs.video_url = node.data.videoUrl;
        }
        if (inputs.timestamp === undefined) {
            inputs.timestamp = node.data.timestamp ?? 0;
        }
    }

    return inputs;
}
