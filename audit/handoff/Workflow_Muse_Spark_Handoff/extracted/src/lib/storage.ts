import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { newId } from "@/lib/id";

// Local filesystem stand-in for object storage (Cloudflare R2 in production).
// Keeping this behind a small interface means swapping to R2 later only
// requires changing this module, not any call sites.

const STORAGE_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads");

export async function saveBuffer(orgId: string, fileName: string, data: Buffer): Promise<string> {
  const dir = path.join(STORAGE_ROOT, orgId);
  await mkdir(dir, { recursive: true });
  const safeName = `${newId()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const fullPath = path.join(dir, safeName);
  await writeFile(fullPath, data);
  return path.relative(process.cwd(), fullPath);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), storagePath));
}
