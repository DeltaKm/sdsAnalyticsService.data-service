import { NextResponse, type NextRequest } from "next/server";
import { analyticsQuerySchema, analyticsResponseSchema } from "@/lib/analytics/schemas";
import { getOverviewAnalytics } from "@/lib/analytics/overview";

export async function GET(request: NextRequest) {
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
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        issues: parsed.error.format(),
      },
      { status: 400 }
    );
  }

  try {
    const data = await getOverviewAnalytics(parsed.data);
    const payload = analyticsResponseSchema.parse(data);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Overview analytics error", error);
    return NextResponse.json({ error: "Failed to load overview analytics" }, { status: 500 });
  }
}
