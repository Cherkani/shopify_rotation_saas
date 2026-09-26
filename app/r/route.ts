import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  return NextResponse.json({ error: "A group route is required" }, { status: 404 });
}
