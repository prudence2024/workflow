import { NextRequest } from "next/server";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { listContactExportRows } from "@/lib/data";
import { buildCsv, buildWorkbook } from "@/lib/spreadsheet";
import { incrementUsage } from "@/lib/usage";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const org = await getCurrentOrg(user);
  if (!org) return new Response("No workspace", { status: 400 });

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const activeRows = await listContactExportRows({ user, org });
  const customKeys = [...new Set(activeRows.flatMap((row) => Object.keys(row.customFields)))].sort();
  const columns = ["firstName", "lastName", "email", "phone", "company", "address", "status", "createdAt", ...customKeys.map((key) => `custom.${key}`)];
  const data = activeRows.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email ?? "",
    phone: r.phone ?? "",
    company: r.company ?? "",
    address: r.address ?? "",
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    ...Object.fromEntries(customKeys.map((key) => [`custom.${key}`, r.customFields[key] ?? ""])),
  }));

  await incrementUsage(org.orgId, "reports");

  if (format === "csv") {
    const csv = `\uFEFF${buildCsv(columns, data)}`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buffer = buildWorkbook("Contacts", columns, data);
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contacts.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const dynamic = "force-dynamic";
