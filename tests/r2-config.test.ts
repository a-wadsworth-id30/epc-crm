import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let r2ConnectionErrorMessage: typeof import("../src/lib/storage/r2").r2ConnectionErrorMessage;

before(async () => {
  moduleWithLoad._load = function loadWithR2Stubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@/lib/crypto/secrets") {
      return { decryptSecret: (value: string) => value };
    }

    if (request === "@/lib/prisma") {
      return { prisma: {} };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    ({ r2ConnectionErrorMessage } = await import("../src/lib/storage/r2"));
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

describe("Cloudflare R2 config", () => {
  it("returns a credential-specific message for signature mismatches", () => {
    const message = r2ConnectionErrorMessage({
      $metadata: { httpStatusCode: 403 },
      name: "SignatureDoesNotMatch",
    });

    assert.match(message, /full R2 secret access key/);
  });
});
