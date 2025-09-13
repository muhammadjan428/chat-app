import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   images: {
    domains: [
      'img.clerk.com',
      'images.clerk.dev', // Also add this as Clerk sometimes uses this domain
    ],
  }
};

export default nextConfig;
