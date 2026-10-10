import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getDownload } from "@/lib/data";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

function safeFileName(value: string): string {
  return value.replace(/[\\"\r\n]/g, "_").slice(0, 180) || "download";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const org = await getCurrentOrg(user);
  if (!org) return new Response("No workspace", { status: 400 });
  const { id } = await params;
  const file = await getDownload({ user, org }, id);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readStoredFile(file.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFileName(file.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Download unavailable", { status: 404 });
  }
}
