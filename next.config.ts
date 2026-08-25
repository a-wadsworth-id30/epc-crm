import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function commandOutput(command: string) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const buildCommit =
  process.env.APP_BUILD_COMMIT ||
  process.env.GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  commandOutput("git rev-parse HEAD") ||
  "unknown";
const buildBranch =
  process.env.APP_BUILD_BRANCH ||
  process.env.GIT_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  commandOutput("git rev-parse --abbrev-ref HEAD") ||
  "unknown";
const buildTime = process.env.APP_BUILD_TIME || new Date().toISOString();
const svgrOptions = {
  svgoConfig: {
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
          },
        },
      },
    ],
  },
};

const cspReportOnly =
  process.env.CSP_REPORT_ONLY === "true" || process.env.CSP_ENFORCE === "false";
const cspAllowUnsafeEval =
  process.env.CSP_ALLOW_UNSAFE_EVAL === "true" ||
  process.env.NODE_ENV !== "production";
const cspAllowHttpsScripts = process.env.CSP_ALLOW_HTTPS_SCRIPTS === "true";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(cspAllowUnsafeEval ? ["'unsafe-eval'"] : []),
  ...(cspAllowHttpsScripts ? ["https:"] : []),
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' data: blob: https:",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: cspReportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Download-Options",
    value: "noopen",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(self), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()",
  },
];

const mediaPreviewSecurityHeaders = [
  {
    key: cspReportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value:
      "default-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
];

const nextConfig: NextConfig = {
  env: {
    APP_BUILD_COMMIT: buildCommit,
    APP_BUILD_BRANCH: buildBranch,
    APP_BUILD_TIME: buildTime,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/media/:fileAssetId/preview",
        headers: mediaPreviewSecurityHeaders,
      },
      {
        source: "/api/pipedrive/files/:linkId",
        headers: mediaPreviewSecurityHeaders,
      },
    ];
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: "@svgr/webpack",
          options: svgrOptions,
        },
      ],
    });
    return config;
  },
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            options: svgrOptions,
          },
        ],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
