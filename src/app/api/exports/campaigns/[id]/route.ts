import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecords, campaigns, contacts } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { buildCsv, buildWorkbook } from "@/lib/spreadsheet";
import { incrementUsage } from "@/lib/usage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const org = await getCurrentOrg(user);
  if (!org) return new Response("No workspace", { status: 400 });

  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, org.orgId))).limit(1);
  if (!campaign) return new Response("Not found", { status: 404 });

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const rows = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      status: campaignRecords.status,
      failureCategory: campaignRecords.failureCategory,
      resultMessage: campaignRecords.resultMessage,
      attempts: campaignRecords.attempts,
      updatedAt: campaignRecords.updatedAt,
    })
    .from(campaignRecords)
    .innerJoin(contacts, eq(campaignRecords.contactId, contacts.id))
    .where(and(eq(campaignRecords.campaignId, id), eq(campaignRecords.orgId, org.orgId)));

  const columns = ["firstName", "lastName", "email", "phone", "status", "failureCategory", "resultMessage", "attempts", "updatedAt"];
  const data = rows.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email ?? "",
    phone: r.phone ?? "",
    status: r.status,
    failureCategory: r.failureCategory ?? "",
    resultMessage: r.resultMessage ?? "",
    attempts: r.attempts,
    updatedAt: r.updatedAt.toISOString(),
  }));

  await incrementUsage(org.orgId, "reports");

  const safeName = campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (format === "csv") {
    const csv = buildCsv(columns, data);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${safeName}-report.csv"`,
      },
    });
  }

  const buffer = buildWorkbook("Report", columns, data);
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-report.xlsx"`,
    },
  });
}

export const dynamic = "force-dynamic";
