import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker production builds use Next's minimal standalone server output.
  // This does not change the local `next dev` workflow.
  output: "standalone",
};

export default nextConfig;
