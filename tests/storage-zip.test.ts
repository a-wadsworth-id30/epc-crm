import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

moduleWithLoad._load = function loadWithServerOnlyStub(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }

  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};

let createStoredZip: typeof import("../src/lib/storage/zip").createStoredZip;
let uniqueStoredZipFiles: typeof import("../src/lib/storage/zip").uniqueStoredZipFiles;

before(async () => {
  ({ createStoredZip, uniqueStoredZipFiles } = await import(
    "../src/lib/storage/zip"
  ));
});

describe("stored ZIP files", () => {
  it("deduplicates unsafe and repeated filenames", () => {
    const files = uniqueStoredZipFiles([
      {
        data: Buffer.from("one"),
        modifiedAt: new Date("2026-07-30T10:00:00.000Z"),
        name: "../Proposal.pdf",
      },
      {
        data: Buffer.from("two"),
        modifiedAt: new Date("2026-07-30T10:00:00.000Z"),
        name: "../Proposal.pdf",
      },
      {
        data: Buffer.from("three"),
        modifiedAt: new Date("2026-07-30T10:00:00.000Z"),
        name: "",
      },
    ]);

    assert.deepEqual(
      files.map((file) => file.name),
      ["..-Proposal.pdf", "..-Proposal-2.pdf", "document-3"],
    );
  });

  it("creates a stored ZIP archive with central directory entries", () => {
    const zip = createStoredZip([
      {
        data: Buffer.from("hello"),
        modifiedAt: new Date("2026-07-30T10:00:00.000Z"),
        name: "first.txt",
      },
      {
        data: Buffer.from("world"),
        modifiedAt: new Date("2026-07-30T10:01:00.000Z"),
        name: "second.txt",
      },
    ]);

    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.equal(zip.readUInt16LE(zip.length - 14), 2);
    assert.match(zip.toString("latin1"), /first\.txt/);
    assert.match(zip.toString("latin1"), /second\.txt/);
  });
});
