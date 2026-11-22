import type { NextConfig } from "next";
import { frameHeaders } from "./src/shared/config/frame-headers";

const nextConfig: NextConfig = {
  async headers() {
    return frameHeaders();
  },
};

export default nextConfig;
