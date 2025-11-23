'use client';

import type { OverviewRange as ClientOverviewRange } from "@/app/generated/prisma/enums";

export const OverviewRange = {
  LAST_7_DAYS: "LAST_7_DAYS",
  LAST_30_DAYS: "LAST_30_DAYS",
  LAST_90_DAYS: "LAST_90_DAYS",
  LIFETIME: "LIFETIME",
} as const satisfies Record<string, ClientOverviewRange>;

export type OverviewRange = ClientOverviewRange;
