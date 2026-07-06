import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Confirms exactly which build is serving in production (build-version mismatch check).
export async function GET() {
  return NextResponse.json(
    {
      version: APP_VERSION,
      node: process.version,
      sqlConfigured: Boolean(process.env.DATABASE_URL),
      blobConfigured: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
