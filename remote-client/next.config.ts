import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: 'export',
  // Disable image optimization during export since it's a static site
  images: {
    unoptimized: true,
  },
};

export default withPWA(nextConfig);
