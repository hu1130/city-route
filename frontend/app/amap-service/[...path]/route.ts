import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyAmap(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyAmap(request, context);
}

async function proxyAmap(request: NextRequest, context: RouteContext) {
  const securityCode = process.env.AMAP_SECURITY_JS_CODE || "";
  if (!securityCode) {
    return Response.json({ detail: "AMap security code is not configured." }, { status: 500 });
  }

  const params = await context.params;
  const rawPath = (params.path ?? []).map((part) => encodeURIComponent(part)).join("/");
  const upstreamBase = rawPath.startsWith("v4/map/styles") ? "https://webapi.amap.com" : "https://restapi.amap.com";
  const upstreamUrl = new URL(`${upstreamBase}/${rawPath}`);
  const requestUrl = new URL(request.url);
  requestUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));
  upstreamUrl.searchParams.set("jscode", securityCode);

  const response = await fetch(upstreamUrl, {
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    headers: contentHeaders(request.headers),
    method: request.method,
  });

  return new Response(response.body, {
    headers: responseHeaders(response.headers),
    status: response.status,
  });
}

function contentHeaders(headers: Headers) {
  const next = new Headers();
  const contentType = headers.get("content-type");
  if (contentType) {
    next.set("content-type", contentType);
  }
  return next;
}

function responseHeaders(headers: Headers) {
  const next = new Headers();
  const contentType = headers.get("content-type");
  if (contentType) {
    next.set("content-type", contentType);
  }
  next.set("cache-control", "no-store");
  return next;
}
