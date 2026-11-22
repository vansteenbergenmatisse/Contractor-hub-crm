import type { NextConfig } from "next";
import { frameHeaders } from "./src/shared/config/frame-headers";

// Sent on every route, next to the frame policy (which differs per path and stays as it is, so
// HighLevel can still embed the app). No header here sets Content-Security-Policy or X-Frame-Options.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [...frameHeaders(), { source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
