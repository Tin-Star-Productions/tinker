/** @type {import('next').NextConfig} */
const nextConfig = {
  // API calls go to apps/api running on port 3000
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/api/:path*`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/webhooks/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
