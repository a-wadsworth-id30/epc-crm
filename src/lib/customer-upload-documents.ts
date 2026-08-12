import { parseFileAssetTags } from "@/lib/storage/file-metadata";

export function tagsForCustomerUpload(itemLabel: string, submittedTags: string[]) {
  return parseFileAssetTags(["Customer upload", itemLabel, ...submittedTags].join("\n"));
}
