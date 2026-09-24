import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { buildCsv, buildWorkbook } from "@/lib/spreadsheet";
import { incrementUsage } from "@/lib/usage";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const org = await getCurrentOrg(user.id);
  if (!org) return new Response("No workspace", { status: 400 });

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const rows = await db.select().from(contacts).where(eq(contacts.orgId, org.orgId));
  const activeRows = rows.filter((r) => !r.archivedAt);
  const columns = ["firstName", "lastName", "email", "phone", "company", "address", "status", "createdAt"];
  const data = activeRows.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email ?? "",
    phone: r.phone ?? "",
    company: r.company ?? "",
    address: r.address ?? "",
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  await incrementUsage(org.orgId, "reports");

  if (format === "csv") {
    const csv = buildCsv(columns, data);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts.csv"`,
      },
    });
  }

  const buffer = buildWorkbook("Contacts", columns, data);
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contacts.xlsx"`,
    },
  });
}

export const dynamic = "force-dynamic";
