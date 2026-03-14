import { NextResponse, type NextRequest } from "next/server";
import { analyticsQuerySchema, analyticsResponseSchema } from "@/lib/analytics/schemas";
import { getVendutoAnalytics } from "@/lib/analytics/venduto";
import { verifyEmbedToken } from "@/lib/embed/session";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const claims = await verifyEmbedToken(authHeader ?? undefined);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  const query = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    stores: (() => {
      const values = searchParams.getAll("stores");
      return values.length ? values : undefined;
    })(),
    uniqueKey: claims.uniqueKey,
  };

  const parsed = analyticsQuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        issues: parsed.error.format(),
      },
      { status: 400 },
    );
  }

  try {
    const data = await getVendutoAnalytics(parsed.data);
    const payload = analyticsResponseSchema.parse(data);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Venduto analytics error", error);
    return NextResponse.json({ error: "Failed to load venduto analytics" }, { status: 500 });
  }
}
