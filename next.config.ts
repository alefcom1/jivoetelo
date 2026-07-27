import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Фото еды загружаются через server action; лимит согласован
      // с MAX_PHOTO_BYTES в lib/storage.ts.
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
