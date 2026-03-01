import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getLondonMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function middleware(req: NextRequest) {
  // Toggle: set to false to disable the time gate
  const enabled = false;

  // 18:00 → 21:30 London time
  const now = getLondonMinutesNow();
  const start = 18 * 60;       // 1080
  const end = 21 * 60 + 30;    // 1290

  const inWindow = now >= start && now < end;

  const pathname = req.nextUrl.pathname;

  // Allow the closed page itself (no redirect loop)
  if (pathname === "/closed") return NextResponse.next();

  // Let Next.js internals, API routes, and static assets through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (!inWindow) {
    const url = req.nextUrl.clone();
    url.pathname = "/closed";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
