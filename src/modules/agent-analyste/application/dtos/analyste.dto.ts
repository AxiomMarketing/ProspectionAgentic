import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MAX_RANGE_DAYS = 365;

const agentFilterValues = [
  'veilleur',
  'enrichisseur',
  'scoreur',
  'redacteur',
  'suiveur',
  'nurtureur',
  'all',
] as const;

export const AnalyzePipelineSchema = z
  .object({
    dateFrom: z.string().regex(DATE_REGEX, 'dateFrom must be YYYY-MM-DD'),
    dateTo: z.string().regex(DATE_REGEX, 'dateTo must be YYYY-MM-DD'),
    agentFilter: z.enum(agentFilterValues).optional(),
  })
  .refine(
    (data) => {
      const from = new Date(data.dateFrom);
      const to = new Date(data.dateTo);
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= MAX_RANGE_DAYS;
    },
    { message: `Date range must be between 0 and ${MAX_RANGE_DAYS} days` },
  );

export type AnalyzePipelineDto = z.infer<typeof AnalyzePipelineSchema>;

export const MetricsQuerySchema = z.object({
  dateFrom: z.string().regex(DATE_REGEX, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo: z.string().regex(DATE_REGEX, 'dateTo must be YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export type MetricsQueryDto = z.infer<typeof MetricsQuerySchema>;
