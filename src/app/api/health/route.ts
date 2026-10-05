import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, buildGitSha: process.env.BUILD_GIT_SHA ?? null });
  } catch {
    return Response.json({ ok: false, buildGitSha: process.env.BUILD_GIT_SHA ?? null }, { status: 500 });
  }
}
