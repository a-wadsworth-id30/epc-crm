import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCredentialEncryptionKey } from "../scripts/env-utils";

describe("credential encryption env validation", () => {
  it("treats blank keys as missing", () => {
    assert.deepEqual(validateCredentialEncryptionKey(""), {
      preferredBase64: false,
      present: false,
      usable: false,
    });
  });

  it("rejects short placeholders that the app cannot use", () => {
    assert.deepEqual(
      validateCredentialEncryptionKey("replace-with-base64-32-byte-key"),
      {
        preferredBase64: false,
        present: true,
        usable: false,
      },
    );
  });

  it("accepts generated 32-byte base64 keys as preferred", () => {
    const key = Buffer.alloc(32, 7).toString("base64");

    assert.deepEqual(validateCredentialEncryptionKey(key), {
      preferredBase64: true,
      present: true,
      usable: true,
    });
  });

  it("accepts legacy long string keys but marks them non-preferred", () => {
    assert.deepEqual(validateCredentialEncryptionKey("x".repeat(32)), {
      preferredBase64: false,
      present: true,
      usable: true,
    });
  });
});
