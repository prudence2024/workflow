import { NextRequest } from "next/server";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { getCampaignReportRows } from "@/lib/data";
import { buildCsv, buildWorkbook } from "@/lib/spreadsheet";
import { incrementUsage } from "@/lib/usage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const org = await getCurrentOrg(user);
  if (!org) return new Response("No workspace", { status: 400 });

  const { id } = await params;
  const { campaign, rows } = await getCampaignReportRows({ user, org }, id);
  if (!campaign) return new Response("Not found", { status: 404 });

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

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
