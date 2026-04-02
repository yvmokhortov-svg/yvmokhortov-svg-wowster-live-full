import { NextRequest, NextResponse } from "next/server";
import { isBlockedCountry, normalizeCountryCode } from "./lib/geo";

const DENY_PATH = "/country-denied";

function resolveCountry(request: NextRequest): string | null {
  const queryCountry = request.nextUrl.searchParams.get("country");
  if (queryCountry) return normalizeCountryCode(queryCountry);

  const headerCountry =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country-code");
  if (headerCountry) return normalizeCountryCode(headerCountry);

  return normalizeCountryCode(request.cookies.get("wowster_country")?.value);
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const country = resolveCountry(request);
  const blocked = isBlockedCountry(country);

  if (blocked && pathname !== DENY_PATH) {
    const denyUrl = request.nextUrl.clone();
    denyUrl.pathname = DENY_PATH;
    denyUrl.search = "";
    return NextResponse.redirect(denyUrl);
  }

  if (!blocked && pathname === DENY_PATH) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  const response = NextResponse.next();
  if (country) {
    response.cookies.set("wowster_country", country, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
