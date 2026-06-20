import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Disable image optimization during export since it's a static site
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
