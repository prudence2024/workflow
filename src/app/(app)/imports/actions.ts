"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, customFieldDefinitions, importErrors, imports } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { saveBuffer } from "@/lib/storage";
import { normalizeEmail, normalizePhone, validateContactRow } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";

const CONTACT_FIELDS = ["firstName", "lastName", "email", "phone", "company", "address"] as const;

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

export async function uploadImportAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect("/imports/new?error=" + encodeURIComponent("Please choose a file to upload"));
  }

  const arrayBuffer = await file!.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { columns, rows } = parseSpreadsheet(buffer, file!.name);

  if (columns.length === 0 || rows.length === 0) {
    redirect("/imports/new?error=" + encodeURIComponent("We couldn't detect any rows in that file"));
  }

  const storagePath = await saveBuffer(org.orgId, file!.name, buffer);
  const fileType = file!.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";

  const [record] = await db
    .insert(imports)
    .values({
      orgId: org.orgId,
      fileName: file!.name,
      fileType,
      storagePath,
      totalRows: rows.length,
      columns,
      rows,
      status: "uploaded",
    })
    .returning();

  await logActivity({ orgId: org.orgId, type: "import_uploaded", message: `Uploaded ${file!.name} (${rows.length} rows)` });
  await incrementUsage(org.orgId, "imports");
  redirect(`/imports/${record.id}`);
}

export async function saveMappingAndValidateAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const importId = String(formData.get("importId"));

  const [record] = await db.select().from(imports).where(and(eq(imports.id, importId), eq(imports.orgId, org.orgId))).limit(1);
  if (!record) redirect("/imports");

  const columns = (record!.columns as string[]) ?? [];
  const mapping: Record<string, string> = {};
  for (const field of CONTACT_FIELDS) {
    const value = String(formData.get(`map__${field}`) ?? "");
    if (value) mapping[field] = value;
  }
  const definitions = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
  for (const def of definitions) {
    const value = String(formData.get(`map__custom__${def.key}`) ?? "");
    if (value) mapping[`custom__${def.key}`] = value;
  }

  const rows = (record!.rows as Record<string, string>[]) ?? [];
  await db.delete(importErrors).where(eq(importErrors.importId, importId));

  let validCount = 0;
  let invalidCount = 0;
  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  const errorRows: { rowNumber: number; errors: string[]; rawData: Record<string, string> }[] = [];

  rows.forEach((row, index) => {
    const mapped = {
      firstName: mapping.firstName ? row[mapping.firstName] : "",
      lastName: mapping.lastName ? row[mapping.lastName] : "",
      email: mapping.email ? row[mapping.email] : "",
      phone: mapping.phone ? row[mapping.phone] : "",
    };
    const validation = validateContactRow(mapped);
    const dedupeKey = `${normalizeEmail(mapped.email)}|${normalizePhone(mapped.phone)}`;
    const isDuplicate = dedupeKey !== "|" && seenKeys.has(dedupeKey);
    if (dedupeKey !== "|") seenKeys.add(dedupeKey);

    if (!validation.valid) {
      invalidCount += 1;
      errorRows.push({ rowNumber: index + 2, errors: validation.errors, rawData: row });
    } else if (isDuplicate) {
      duplicateCount += 1;
      errorRows.push({ rowNumber: index + 2, errors: ["Duplicate of another row in this file"], rawData: row });
    } else {
      validCount += 1;
    }
  });

  if (errorRows.length > 0) {
    await db.insert(importErrors).values(errorRows.map((e) => ({ importId, ...e })));
  }

  await db
    .update(imports)
    .set({
      mapping,
      status: "validated",
      validRows: validCount,
      invalidRows: invalidCount,
      duplicateRows: duplicateCount,
    })
    .where(eq(imports.id, importId));

  await logActivity({
    orgId: org.orgId,
    type: "import_validated",
    message: `Validated ${record!.fileName}: ${validCount} valid, ${invalidCount} invalid, ${duplicateCount} duplicate`,
  });

  revalidatePath(`/imports/${importId}`);
  redirect(`/imports/${importId}`);
}

export async function commitImportAction(formData: FormData) {
  const { org } = await requireOrgContext();
  const importId = String(formData.get("importId"));

  const [record] = await db.select().from(imports).where(and(eq(imports.id, importId), eq(imports.orgId, org.orgId))).limit(1);
  if (!record || record.status !== "validated") redirect(`/imports/${importId}`);

  const rows = (record!.rows as Record<string, string>[]) ?? [];
  const mapping = (record!.mapping as Record<string, string>) ?? {};
  const errorRowsRes = await db.select({ rowNumber: importErrors.rowNumber }).from(importErrors).where(eq(importErrors.importId, importId));
  const invalidRowNumbers = new Set(errorRowsRes.map((e) => e.rowNumber));

  const existing = await db.select({ email: contacts.email, phone: contacts.phone }).from(contacts).where(eq(contacts.orgId, org.orgId));
  const existingKeys = new Set(existing.map((c) => `${normalizeEmail(c.email ?? "")}|${normalizePhone(c.phone ?? "")}`));

  let imported = 0;
  let skipped = 0;

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2;
    if (invalidRowNumbers.has(rowNumber)) continue;
    const row = rows[index];

    const email = mapping.email ? normalizeEmail(row[mapping.email]) : "";
    const phone = mapping.phone ? normalizePhone(row[mapping.phone]) : "";
    const key = `${email}|${phone}`;
    if (key !== "|" && existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const customFields: Record<string, string> = {};
    for (const [mapKey, column] of Object.entries(mapping)) {
      if (mapKey.startsWith("custom__")) {
        customFields[mapKey.replace("custom__", "")] = row[column] ?? "";
      }
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        orgId: org.orgId,
        firstName: mapping.firstName ? row[mapping.firstName] : "Unknown",
        lastName: mapping.lastName ? row[mapping.lastName] : "",
        email: email || null,
        phone: phone || null,
        company: mapping.company ? row[mapping.company] : null,
        address: mapping.address ? row[mapping.address] : null,
        customFields,
      })
      .returning();

    await logActivity({ orgId: org.orgId, contactId: contact.id, type: "contact_imported", message: `Imported from ${record!.fileName}` });
    if (key !== "|") existingKeys.add(key);
    imported += 1;
  }

  await db.update(imports).set({ status: "imported" }).where(eq(imports.id, importId));
  await logActivity({ orgId: org.orgId, type: "import_completed", message: `Imported ${imported} contacts from ${record!.fileName} (${skipped} skipped as duplicates)` });
  await incrementUsage(org.orgId, "contacts", imported);

  revalidatePath(`/imports/${importId}`);
  revalidatePath("/contacts");
  redirect(`/imports/${importId}`);
}
