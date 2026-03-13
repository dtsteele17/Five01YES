import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SITE_PASSWORD = "Classdarts";
const COOKIE_NAME = "site-auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth/callback") ||
    pathname === "/site-password" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get(COOKIE_NAME);
  if (authCookie?.value === SITE_PASSWORD) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/site-password";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
