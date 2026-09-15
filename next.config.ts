import type { NextConfig } from "next";

/** The Pages workflow sets this; the site then lives under https://tatuck.github.io/language-trainer/. */
const onGitHubPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  // Pure static site: no route handlers, no server. `next build` writes `out/`.
  output: "export",
  // Static hosts serve `/notebook/index.html`, not `/notebook`.
  trailingSlash: true,
  basePath: onGitHubPages ? "/language-trainer" : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
