import type { NextConfig } from "next";

// In development, proxy /api to the local backend unless API_PROXY says
// otherwise (set API_PROXY="" to disable). Production deployments either set
// API_PROXY or serve the API on the same origin without this rewrite.
const apiProxy =
  process.env.NODE_ENV === "development" && process.env.API_PROXY === undefined
    ? "http://127.0.0.1:4000"
    : process.env.API_PROXY || undefined;

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["*.vercel.run"],
  ...(apiProxy
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${apiProxy}/api/:path*` }];
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
