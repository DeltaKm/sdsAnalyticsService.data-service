import { z } from "zod";

export const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  stores: z.array(z.string()).optional(),
});

const tableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(["left", "right"]).optional(),
  width: z.number().optional(),
});

const seriesPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
});

const seriesSchema = z.object({
  name: z.string(),
  data: z.array(seriesPointSchema),
});

export const analyticsResponseSchema = z.object({
  kpi: z.record(z.number()),
  chart: z.object({
    series: z.array(seriesSchema),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
  }),
  table: z.object({
    columns: z.array(tableColumnSchema),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
  }),
});

export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
