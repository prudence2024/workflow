import { describe, expect, it } from "vitest";
import {
  buildCloudinaryUploadParameters,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_DIMENSION,
  validateCloudinaryAssetMetadata,
} from "../src/lib/cloudinary-upload-policy";

const validAsset = {
  public_id: "diplomat-global/products/example",
  secure_url:
    "https://res.cloudinary.com/demo/image/upload/v1/diplomat-global/products/example.png",
  resource_type: "image",
  format: "png",
  bytes: 400_000,
  width: 1_200,
  height: 900,
};

describe("Cloudinary upload policy", () => {
  it("signs the provider format allowlist without forcing a JPEG transformation", () => {
    expect(buildCloudinaryUploadParameters(123, "diplomat-global/products")).toEqual({
      timestamp: 123,
      folder: "diplomat-global/products",
      allowed_formats: "jpg,jpeg,png,webp",
    });
    expect(buildCloudinaryUploadParameters(123, "diplomat-global/products")).not.toHaveProperty(
      "format",
    );
  });

  it("signs a minimal parameter set with no client-controllable public_id or transformation", () => {
    const params = buildCloudinaryUploadParameters(123, "diplomat-global/products");

    // Exactly these signed params: any client-appended param (e.g. public_id) breaks
    // the Cloudinary signature, so path-style/filename injection into signed params is
    // structurally impossible.
    expect(Object.keys(params).sort()).toEqual(["allowed_formats", "folder", "timestamp"]);
  });

  it.each(["jpg", "jpeg", "png", "webp"])("accepts provider-verified %s images", (format) => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, format },
      "diplomat-global/products",
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    "php",
    "php3",
    "php4",
    "php5",
    "phtml",
    "phar",
    "jsp",
    "jspx",
    "asp",
    "aspx",
    "cgi",
    "exe",
    "sh",
    "html",
  ])("rejects server-executable/script format %s at the policy boundary", (format) => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, format },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("JPEG") });
  });

  it.each(["gif", "svg", "pdf", "html", "txt", undefined])(
    "rejects provider format %s",
    (format) => {
      const result = validateCloudinaryAssetMetadata(
        { ...validAsset, format },
        "diplomat-global/products",
      );

      expect(result).toMatchObject({ ok: false, message: expect.stringContaining("JPEG") });
    },
  );

  it("rejects a non-image resource even when the browser called it an image", () => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, resource_type: "raw", format: "jpg" },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("identify") });
  });

  it("rejects oversized images with actual and allowed sizes in the message", () => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, bytes: IMAGE_UPLOAD_MAX_BYTES + 1024 * 1024 },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/6\.0 MB.*5\.0 MB/),
    });
  });

  it("rejects excessive dimensions", () => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, width: IMAGE_UPLOAD_MAX_DIMENSION + 1 },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("4001×900") });
  });

  it("rejects assets outside the authorized folder without marking them safe to delete", () => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, public_id: "another-project/example", folder: "another-project" },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({ ok: false, ownedByExpectedFolder: false });
  });

  it.each([
    "http://res.cloudinary.com/demo/image/upload/example.png",
    "https://example.com/example.png",
    "not-a-url",
  ])("rejects unauthorized provider URL %s", (secure_url) => {
    const result = validateCloudinaryAssetMetadata(
      { ...validAsset, secure_url },
      "diplomat-global/products",
    );

    expect(result).toMatchObject({ ok: false });
  });

  it("accepts Cloudinary dynamic-folder metadata", () => {
    const result = validateCloudinaryAssetMetadata(
      {
        ...validAsset,
        public_id: "generated-id-without-folder",
        asset_folder: "diplomat-global/products",
      },
      "diplomat-global/products",
    );

    expect(result.ok).toBe(true);
  });
});
