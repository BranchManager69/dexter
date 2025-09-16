/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    serverActions: { allowedOrigins: ['*'] }
  }
};

export default nextConfig;
