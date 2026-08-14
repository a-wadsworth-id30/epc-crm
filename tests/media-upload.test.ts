import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let media: typeof import("../src/lib/storage/media");

before(async () => {
  moduleWithLoad._load = function loadWithMediaUploadStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@/lib/prisma") {
      return { prisma: {} };
    }

    if (request === "@/lib/storage/support-data") {
      return { revalidateStorageSupportData: () => undefined };
    }

    if (request === "@/lib/storage/r2") {
      return {
        cloudflareR2Provider: "cloudflare-r2",
        getR2Config: async () => null,
        putR2Object: async () => {
          throw new Error("putR2Object should not be called");
        },
      };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    media = await import("../src/lib/storage/media");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

describe("media upload validation", () => {
  const safeSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#111827" d="M0 0h10v10H0z"/></svg>',
  );

  it("keeps SVG uploads blocked unless a caller opts in", () => {
    assert.throws(
      () =>
        media.validateMediaObjectHead({
          allowedMimeTypes: "image/*,application/pdf",
          body: safeSvg,
          fileName: "logo.svg",
          mimeType: "image/svg+xml",
          requireImage: true,
        }),
      /SVG uploads are not supported/,
    );
  });

  it("allows safe SVG uploads when explicitly enabled", () => {
    const result = media.validateMediaObjectHead({
      allowSvg: true,
      allowedMimeTypes: "image/*,application/pdf",
      body: safeSvg,
      fileName: "logo.svg",
      mimeType: "image/svg+xml",
      requireImage: true,
    });

    assert.equal(result.effectiveMimeType, "image/svg+xml");
    assert.equal(media.mediaFileExtension("logo.svg", result.effectiveMimeType), "svg");
  });

  it("rejects SVG uploads with active content", () => {
    const unsafeSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
    );

    assert.throws(
      () =>
        media.validateMediaObjectHead({
          allowSvg: true,
          allowedMimeTypes: "image/*,application/pdf",
          body: unsafeSvg,
          fileName: "logo.svg",
          mimeType: "image/svg+xml",
          requireImage: true,
        }),
      /without scripts or external references/,
    );
  });
});
