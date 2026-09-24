/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.18.128.1", "10.0.0.202"],
  reactStrictMode: true,
  experimental: { proxyTimeout: 180_000, proxyClientMaxBodySize: "28mb" },
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/v1/:path*", destination: "http://127.0.0.1:4000/v1/:path*" }]
      : [];
  },
  transpilePackages: ["@markos/i18n", "@markos/shared-types", "@markos/ui-tokens"]
};

export default nextConfig;
