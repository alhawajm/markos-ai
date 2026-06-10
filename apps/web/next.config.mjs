/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@markos/i18n", "@markos/shared-types", "@markos/ui-tokens"]
};

export default nextConfig;
