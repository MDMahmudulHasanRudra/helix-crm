import type { NextConfig } from "next";

const apiOrigin = process.env.API_URL ?? "http://localhost:5080";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The workspace is authenticated and data-driven; pages intentionally stream
    // instead of prerendering an instant shell. Keep the insight available but
    // don't validate every route automatically.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
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
