import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/simulate": ["./data/**/*.json"],
    "/api/simulate/temporal": ["./data/**/*.json"],
    "/api/simulate/llm": ["./data/**/*.json"],
    "/api/analyze-resolution": ["./data/**/*.json"],
    "/api/kg/query": ["./data/**/*.json"],
    "/api/kg/explore": ["./data/**/*.json"],
    "/api/debate": ["./data/**/*.json"],
    "/api/events": ["./data/**/*.json"],
    "/api/kg/influence": ["./data/**/*.json"],
    "/api/resolutions": ["./data/**/*.json"],
  },
};

export default nextConfig;
