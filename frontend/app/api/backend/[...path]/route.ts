const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8011";

type ProxyContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: Request, context: ProxyContext) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: ProxyContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: ProxyContext) {
  return proxyRequest(request, context);
}

async function proxyRequest(request: Request, context: ProxyContext) {
  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(path.join("/"), `${BACKEND_INTERNAL_URL.replace(/\/$/, "")}/`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const response = await fetch(targetUrl, {
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
    headers,
    method: request.method,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(await response.arrayBuffer(), {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
