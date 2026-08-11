import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pins the workspace root to this app so Turbopack doesn't walk up into
    // an unrelated package-lock.json outside the git repo.
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Next.js's built-in Server Action CSRF protection compares the
      // request's Origin header against Host by default — sufficient for
      // Vercel's own domains. If a custom production domain (or a reverse
      // proxy in front of one) is added later, list it here, or same-origin
      // Server Action calls from that domain will be rejected. See plan
      // Section 7 (CSRF) and Next.js's Data Security guide.
      // allowedOrigins: ["your-custom-domain.com"],
    },
  },
};

export default nextConfig;
