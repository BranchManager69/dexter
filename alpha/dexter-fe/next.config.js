
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN && process.env.NEXT_PUBLIC_API_ORIGIN !== 'relative'
  ? process.env.NEXT_PUBLIC_API_ORIGIN.replace(/\/$/, '')
  : "https://api.dexter.cash";
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    serverActions: { allowedOrigins: ['*'] }
  },
  async rewrites() {
    return [
      { source: '/auth/config', destination: `${API_ORIGIN}/auth/config` },
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
