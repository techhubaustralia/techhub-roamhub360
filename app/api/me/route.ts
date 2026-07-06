import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";

export async function GET() {
  return NextResponse.json(await getUser());
}
