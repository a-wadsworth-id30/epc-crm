import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDocumentLibrarySettings,
  documentUploadTypeDefinitions,
  isDocumentUploadType,
  normaliseDocumentFolders,
  resolveDocumentFolderForUpload,
} from "../src/lib/document-library";

describe("document library", () => {
  it("maps customer upload types to the expected default folders", () => {
    const utilityBillFolder = resolveDocumentFolderForUpload({
      folders: defaultDocumentLibrarySettings.folders,
      uploadType: "utility_bill",
    });
    const floorPlanFolder = resolveDocumentFolderForUpload({
      folders: defaultDocumentLibrarySettings.folders,
      uploadType: "floor_plan",
    });
    const sitePhotoFolder = resolveDocumentFolderForUpload({
      folders: defaultDocumentLibrarySettings.folders,
      uploadType: "site_photo",
    });

    assert.equal(utilityBillFolder?.slug, "utility-bills");
    assert.equal(floorPlanFolder?.slug, "floor-plans-and-drawings");
    assert.equal(sitePhotoFolder?.slug, "surveys-and-site-photos");
  });

  it("keeps automatic filing stable when folder names are changed", () => {
    const folders = normaliseDocumentFolders([
      { name: "Energy Evidence", slug: "utility-bills" },
      { name: "Plans", slug: "floor-plans-and-drawings" },
    ]);

    assert.equal(
      resolveDocumentFolderForUpload({
        folders,
        uploadType: "utility_bill",
      })?.name,
      "Energy Evidence",
    );
  });

  it("allows only controlled document upload types", () => {
    assert.equal(isDocumentUploadType("commissioning_handover"), true);
    assert.equal(isDocumentUploadType("random-folder"), false);
    assert.ok(documentUploadTypeDefinitions.length >= 10);
  });

  it("does not silently file invalid folder references", () => {
    assert.equal(
      resolveDocumentFolderForUpload({
        folders: defaultDocumentLibrarySettings.folders,
        folderSlug: "unknown-folder",
      }),
      null,
    );
  });
});
