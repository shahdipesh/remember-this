import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // TEMP: auth disabled for testing. Re-enable before handoff.
  return NextResponse.next();
}

// /api/messages is intentionally excluded: it is protected by the
// ?secret=CRON_SECRET query param instead of basic auth.
export const config = {
  matcher: ["/", "/harness", "/api/chat", "/api/history"],
};
