/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.18.128.1", "10.0.0.202"],
  reactStrictMode: true,
  transpilePackages: ["@markos/i18n", "@markos/shared-types", "@markos/ui-tokens"]
};

export default nextConfig;
