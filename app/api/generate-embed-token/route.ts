import { NextResponse } from "next/server";
import { signEmbedToken } from "@/lib/embed/session";

export async function POST(request: Request) {
  try {
    const { uniqueKey, userId, permissions } = await request.json();

    if (!uniqueKey) {
      return NextResponse.json(
        { error: "uniqueKey is required" },
        { status: 400 }
      );
    }

    const token = await signEmbedToken({
      uniqueKey,
      userId,
      permissions: permissions || [],
    });

    const baseUrl = process.env.EMBED_BASE_URL || "http://localhost:3000";
    const embedUrl = `${baseUrl}/embed?token=${token}`;

    return NextResponse.json({
      embedUrl,
      token,
      expiresIn: 30 * 24 * 60 * 60, // 30 d
    });
  } catch (error) {
    console.error("Failed to generate embed token:", error);
    return NextResponse.json(
      { error: "Failed to generate embed token" },
      { status: 500 }
    );
  }
}
