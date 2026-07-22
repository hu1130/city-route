import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/_AMapService/")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname.replace(/^\/_AMapService/, "/amap-service");
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/_AMapService/:path*"],
};
