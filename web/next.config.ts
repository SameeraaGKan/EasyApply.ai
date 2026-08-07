import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pins the workspace root to this app so Turbopack doesn't walk up into
    // an unrelated package-lock.json outside the git repo.
    root: path.join(__dirname),
  },
};

export default nextConfig;
