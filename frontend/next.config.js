/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.0.118",
    "192.168.0.119",
    "192.168.0.123",
    "192.168.0.117",
    "192.168.3.134",
  ],
  devIndicators: false,
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8011";
    const beforeFiles = [
      {
        source: "/_AMapService/:path*",
        destination: "/amap-service/:path*",
      },
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl.replace(/\/$/, "")}/:path*`,
      },
    ];

    return {
      beforeFiles,
    };
  },
};

module.exports = nextConfig;
