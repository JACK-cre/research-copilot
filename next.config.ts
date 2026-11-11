import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@napi-rs/canvas", "unpdf", "pngjs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "600mb",
    },
    proxyClientMaxBodySize: "600mb",
  },
};

export default nextConfig;
