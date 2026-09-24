import { config as loadEnv } from "dotenv";
import { v2 as cloudinary } from "cloudinary";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env.vercel", quiet: true, override: false });

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

if (!cloudName || !apiKey || !apiSecret) {
  console.error("Cloudinary provider verification requires configured credentials.");
  process.exit(2);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

const folder = "diplomat-global/products/codex-provider-verification";
const allowedFormats = "jpg,jpeg,png,webp";
const createdPublicIds = [];

const fixtures = [
  {
    name: "jpeg",
    mime: "image/jpeg",
    extension: "jpg",
    base64:
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
  },
  {
    name: "png",
    mime: "image/png",
    extension: "png",
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  },
  {
    name: "webp",
    mime: "image/webp",
    extension: "webp",
    base64: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
  },
];

async function signedUpload(bytes, filename, mime) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const signedParameters = {
    timestamp,
    folder,
    allowed_formats: allowedFormats,
  };
  const signature = cloudinary.utils.api_sign_request(signedParameters, apiSecret);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("allowed_formats", allowedFormats);
  form.append("signature", signature);

  return fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
}

async function run() {
  for (const fixture of fixtures) {
    const response = await signedUpload(
      Buffer.from(fixture.base64, "base64"),
      `${fixture.name}.${fixture.extension}`,
      fixture.mime,
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Valid ${fixture.name} upload was rejected with HTTP ${response.status}.`);
    }
    createdPublicIds.push(body.public_id);
    if (body.resource_type !== "image" || !["jpg", "jpeg", "png", "webp"].includes(body.format)) {
      throw new Error(`Cloudinary returned unexpected metadata for ${fixture.name}.`);
    }
    console.log(`PASS valid ${fixture.name}: provider format=${body.format}`);
  }

  const invalidFixtures = [
    { name: "renamed-text.jpg", mime: "image/jpeg", body: "this is not an image" },
    {
      name: "renamed-html.jpg",
      mime: "image/jpeg",
      body: "<html><script>alert(1)</script></html>",
    },
    { name: "malformed.jpg", mime: "image/jpeg", body: Buffer.from([0xff, 0xd8, 0xff]) },
  ];
  for (const fixture of invalidFixtures) {
    const response = await signedUpload(fixture.body, fixture.name, fixture.mime);
    if (response.ok) {
      const body = await response.json();
      createdPublicIds.push(body.public_id);
      throw new Error(`Invalid fixture ${fixture.name} was accepted by Cloudinary.`);
    }
    console.log(`PASS invalid ${fixture.name}: provider rejected HTTP ${response.status}`);
  }
}

try {
  await run();
} finally {
  for (const publicId of createdPublicIds) {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    if (result.result !== "ok" && result.result !== "not found") {
      console.error(`Cleanup warning for provider-verification asset: ${result.result}`);
    }
  }
}
