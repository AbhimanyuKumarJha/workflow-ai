import { z } from 'zod';

export const RunScopeEnum = z.enum(['FULL', 'SELECTED', 'SINGLE']);
export const RunStatusEnum = z.enum(['RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL']);

export const WorkflowVersionSchema = z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
    viewport: z.object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive(),
    }),
});

export const WorkflowCreateSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .default('Untitled workflow')
        .optional(),
    description: z.string().trim().max(500).optional(),
    snapshot: WorkflowVersionSchema.optional(),
});

export const WorkflowUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
    viewport: z.object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive(),
    }),
});

export const ExecuteRequestSchema = z
    .object({
        workflowId: z.string().cuid(),
        scope: RunScopeEnum.default('FULL'),
        selectedNodeIds: z.array(z.string()).default([]).optional(),
    })
    .superRefine((value, ctx) => {
        if ((value.scope === 'SELECTED' || value.scope === 'SINGLE') && !value.selectedNodeIds?.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['selectedNodeIds'],
                message: 'selectedNodeIds is required for SELECTED and SINGLE scope',
            });
        }

        if (value.scope === 'SINGLE' && value.selectedNodeIds && value.selectedNodeIds.length !== 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['selectedNodeIds'],
                message: 'SINGLE scope accepts exactly one node ID',
            });
        }
    });

export const HistoryQuerySchema = z
    .object({
        workflowId: z.string().cuid().optional(),
        runId: z.string().cuid().optional(),
        status: RunStatusEnum.optional(),
        scope: RunScopeEnum.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        cursor: z.string().cuid().optional(),
    })
    .superRefine((value, ctx) => {
        if (!value.workflowId && !value.runId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['workflowId'],
                message: 'Either workflowId or runId is required',
            });
        }
    });

export const AssetTypeEnum = z.enum(['IMAGE', 'VIDEO']);

export const AssetUploadSchema = z.object({
    type: AssetTypeEnum,
    url: z.string().url(),
    provider: z.string().trim().min(1).max(50).default('transloadit').optional(),
    assemblyId: z.string().trim().max(255).optional(),
    mimeType: z.string().trim().max(120).optional(),
    bytes: z.number().int().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
});

export type WorkflowCreateInput = z.infer<typeof WorkflowCreateSchema>;
export type WorkflowUpdateInput = z.infer<typeof WorkflowUpdateSchema>;
export type ExecuteRequestInput = z.infer<typeof ExecuteRequestSchema>;
export type HistoryQueryInput = z.infer<typeof HistoryQuerySchema>;
export type AssetUploadInput = z.infer<typeof AssetUploadSchema>;
