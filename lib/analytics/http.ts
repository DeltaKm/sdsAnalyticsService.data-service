import { NextRequest, NextResponse } from "next/server";
import { analyticsQuerySchema } from "./schemas";

export function parseAnalyticsRequest(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    stores: (() => {
      const values = searchParams.getAll("stores");
      return values.length ? values : undefined;
    })(),
  };

  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        {
          error: "Invalid query parameters",
          issues: parsed.error.format(),
        },
        { status: 400 }
      ),
    } as const;
  }

  return { data: parsed.data } as const;
}
