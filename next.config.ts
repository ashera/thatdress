import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server actions default to a 1MB request body limit. Photo
    // uploads are 5MB each (MAX_IMAGE_BYTES in the wizard action), and
    // the extras uploader accepts up to 10 files at once — bump the
    // limit so an iPhone camera shot, or a multi-file pick, doesn't
    // 413 before our own validation runs.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
