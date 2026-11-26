import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["*.vercel.run"],
  ...(process.env.API_PROXY
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${process.env.API_PROXY}/api/:path*` }];
        },
      }
    : {}),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
