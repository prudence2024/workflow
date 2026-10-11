"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { activityEvents, contactImports, contacts, customFieldDefinitions, files, importErrors, imports } from "@/db/schema";
import { getCurrentOrg, getCurrentUser } from "@/lib/auth";
import { inWorkspace } from "@/lib/data";
import { customFieldKey, parseSpreadsheet } from "@/lib/spreadsheet";
import { saveBuffer } from "@/lib/storage";
import { normalizeEmail, normalizePhone, validateContactRow } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { incrementUsage } from "@/lib/usage";
import { assertPlanLimit } from "@/lib/planLimits";

const CONTACT_FIELDS = ["firstName", "lastName", "email", "phone", "company", "address"] as const;
const STANDARD_COLUMNS = new Set(["firstname", "first_name", "lastname", "last_name", "email", "phone", "company", "organization", "organisation", "address"]);

async function requireOrgContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg(user!);
  if (!org) redirect("/onboarding");
  return { user: user!, org };
}

export async function uploadImportAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect("/imports/new?error=" + encodeURIComponent("Please choose a file to upload"));
  }

  const fileName = file!.name.toLowerCase();
  if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
    redirect("/imports/new?error=" + encodeURIComponent("Upload a CSV or XLSX file"));
  }
  if (file!.size > 10 * 1024 * 1024) {
    redirect("/imports/new?error=" + encodeURIComponent("Files must be 10 MB or smaller"));
  }

  const arrayBuffer = await file!.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  let parsed: ReturnType<typeof parseSpreadsheet> | null = null;
  let parseFailed = false;
  try {
    parsed = parseSpreadsheet(buffer, file!.name);
  } catch {
    parseFailed = true;
  }
  if (parseFailed) redirect("/imports/new?error=" + encodeURIComponent("We couldn't read that spreadsheet"));
  const { columns, rows } = parsed!;

  if (columns.length === 0 || rows.length === 0) {
    redirect("/imports/new?error=" + encodeURIComponent("We couldn't detect any rows in that file"));
  }

  // Bytes go to object storage (R2 in production); only the key is recorded in
  // PostgreSQL. In production with no R2 configured this throws rather than
  // writing a customer upload to a container filesystem.
  let stored: Awaited<ReturnType<typeof saveBuffer>> | null = null;
  let storageFailed = false;
  try {
    stored = await saveBuffer(org.orgId, file!.name, buffer, file!.type || "application/octet-stream");
  } catch {
    storageFailed = true;
  }
  if (storageFailed) redirect("/imports/new?error=" + encodeURIComponent("Upload storage is not available yet. Please try again later."));
  const storagePath = stored!.key;
  const fileType = file!.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";

  const record = await inWorkspace({ user, org }, async (tx) => {
    // Preserve every non-standard spreadsheet column as a workspace field.
    // The import preview on the next step exposes these definitions for mapping;
    // no customer data is silently discarded.
    const existing = await tx.select({ key: customFieldDefinitions.key }).from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
    const existingKeys = new Set(existing.map((field) => field.key));
    for (const [index, column] of columns.entries()) {
      const normalized = column.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!normalized || STANDARD_COLUMNS.has(normalized)) continue;
      let key = customFieldKey(column, index);
      let suffix = 2;
      while (existingKeys.has(key)) key = `${customFieldKey(column, index)}_${suffix++}`;
      await tx.insert(customFieldDefinitions).values({ orgId: org.orgId, key, label: column.trim() || `Custom field ${index + 1}`, fieldType: "text" }).onConflictDoNothing();
      existingKeys.add(key);
    }
    const [created] = await tx
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
    await tx.insert(files).values({
      orgId: org.orgId,
      kind: "import",
      fileName: file!.name,
      mimeType: file!.type || "application/octet-stream",
      sizeBytes: buffer.byteLength,
      storagePath,
    });
    return created;
  });

  await logActivity({ orgId: org.orgId, type: "import_uploaded", message: `Uploaded ${file!.name} (${rows.length} rows)` });
  await incrementUsage(org.orgId, "imports");
  redirect(`/imports/${record.id}`);
}

export async function saveMappingAndValidateAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const importId = String(formData.get("importId"));

  const outcome = await inWorkspace({ user, org }, async (tx) => {
    const [record] = await tx.select().from(imports).where(and(eq(imports.id, importId), eq(imports.orgId, org.orgId))).limit(1);
    if (!record) return null;

    const mapping: Record<string, string> = {};
    for (const field of CONTACT_FIELDS) {
      const value = String(formData.get(`map__${field}`) ?? "");
      if (value) mapping[field] = value;
    }
    const definitions = await tx.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, org.orgId));
    for (const def of definitions) {
      const value = String(formData.get(`map__custom__${def.key}`) ?? "");
      if (value) mapping[`custom__${def.key}`] = value;
    }

    const rows = (record.rows as Record<string, string>[]) ?? [];
    await tx.delete(importErrors).where(eq(importErrors.importId, importId));

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
      await tx.insert(importErrors).values(errorRows.map((e) => ({ importId, ...e })));
    }

    await tx
      .update(imports)
      .set({
        mapping,
        status: "validated",
        validRows: validCount,
        invalidRows: invalidCount,
        duplicateRows: duplicateCount,
      })
      .where(eq(imports.id, importId));

    return { fileName: record.fileName, validCount, invalidCount, duplicateCount };
  });

  if (!outcome) redirect("/imports");

  await logActivity({
    orgId: org.orgId,
    type: "import_validated",
    message: `Validated ${outcome.fileName}: ${outcome.validCount} valid, ${outcome.invalidCount} invalid, ${outcome.duplicateCount} duplicate`,
  });

  revalidatePath(`/imports/${importId}`);
  redirect(`/imports/${importId}`);
}

export async function commitImportAction(formData: FormData) {
  const { user, org } = await requireOrgContext();
  const importId = String(formData.get("importId"));

  const outcome = await inWorkspace({ user, org }, async (tx) => {
    const [record] = await tx.select().from(imports).where(and(eq(imports.id, importId), eq(imports.orgId, org.orgId))).limit(1);
    if (!record || record.status !== "validated") return null;
    await assertPlanLimit(tx, org.orgId, "contacts", record.validRows);

    const rows = (record.rows as Record<string, string>[]) ?? [];
    const mapping = (record.mapping as Record<string, string>) ?? {};
    const errorRowsRes = await tx.select({ rowNumber: importErrors.rowNumber }).from(importErrors).where(eq(importErrors.importId, importId));
    const invalidRowNumbers = new Set(errorRowsRes.map((e) => e.rowNumber));

    const existing = await tx
      .select({ id: contacts.id, email: contacts.email, phone: contacts.phone })
      .from(contacts)
      .where(eq(contacts.orgId, org.orgId));
    const existingByKey = new Map(existing.map((c) => [
      `${normalizeEmail(c.email ?? "")}|${normalizePhone(c.phone ?? "")}`,
      c.id,
    ]));

    let imported = 0;
    let skipped = 0;

    for (let index = 0; index < rows.length; index++) {
      const rowNumber = index + 2;
      if (invalidRowNumbers.has(rowNumber)) continue;
      const row = rows[index];

      const email = mapping.email ? normalizeEmail(row[mapping.email]) : "";
      const phone = mapping.phone ? normalizePhone(row[mapping.phone]) : "";
      const key = `${email}|${phone}`;
      const existingContactId = key !== "|" ? existingByKey.get(key) : undefined;
      if (existingContactId) {
        await tx.insert(contactImports).values({
          orgId: org.orgId,
          contactId: existingContactId,
          importId,
          sourceRow: rowNumber,
        }).onConflictDoNothing();
        skipped += 1;
        continue;
      }

      const customFields: Record<string, string> = {};
      for (const [mapKey, column] of Object.entries(mapping)) {
        if (mapKey.startsWith("custom__")) {
          customFields[mapKey.replace("custom__", "")] = row[column] ?? "";
        }
      }

      const [contact] = await tx
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

      await tx.insert(activityEvents).values({
        orgId: org.orgId,
        contactId: contact.id,
        type: "contact_imported",
        message: `Imported from ${record.fileName}`,
      });
      await tx.insert(contactImports).values({
        orgId: org.orgId,
        contactId: contact.id,
        importId,
        sourceRow: rowNumber,
      }).onConflictDoNothing();
      if (key !== "|") existingByKey.set(key, contact.id);
      imported += 1;
    }

    await tx.update(imports).set({ status: "imported" }).where(eq(imports.id, importId));
    return { fileName: record.fileName, imported, skipped };
  });

  if (!outcome) redirect(`/imports/${importId}`);

  await logActivity({ orgId: org.orgId, type: "import_completed", message: `Imported ${outcome.imported} contacts from ${outcome.fileName} (${outcome.skipped} skipped as duplicates)` });
  await incrementUsage(org.orgId, "contacts", outcome.imported);

  revalidatePath(`/imports/${importId}`);
  revalidatePath("/contacts");
  redirect(`/imports/${importId}`);
}
