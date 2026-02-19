import { z } from 'zod'

export const BeadSummarySchema = z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    priority: z.number().int(),
    issue_type: z.string().optional(),
    owner: z.string().optional(),
    acceptance_criteria: z.string().optional(),
    labels: z.array(z.string()).optional(),
    updated_at: z.string().optional()
}).passthrough()

export const BeadSummaryListSchema = z.array(BeadSummarySchema)

export type BeadSummary = z.infer<typeof BeadSummarySchema>
