import { type NextRequest } from "next/server";
import { resolveRouterRedirect } from "@/lib/router-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupPath: string }> },
) {
  const { groupPath } = await params;
  return resolveRouterRedirect(request, groupPath);
}
