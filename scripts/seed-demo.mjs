/**
 * Development-only demo seed.
 *
 * Refuses to run against anything but the `development` Neon branch (NEON_BRANCH)
 * so a production database can never receive fixture rows. Idempotent: every row
 * uses a fixed UUID plus ON CONFLICT DO NOTHING, so re-running is safe.
 */
import { config } from "dotenv";
import { Client } from "pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local", quiet: true });

const branch = process.env.NEON_BRANCH ?? "";
if (branch !== "development") {
  console.error(`REFUSING to seed: NEON_BRANCH is "${branch || "(unset)"}", expected "development".`);
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const client = new Client({ connectionString: url });

// Report the offending statement when a query fails, instead of making the
// operator guess which of thirty inserts went wrong.
const originalQuery = client.query.bind(client);
client.query = async (text, params) => {
  try {
    return await originalQuery(text, params);
  } catch (err) {
    const sql = typeof text === "string" ? text : (text?.text ?? "");
    err.message += `\n-- failing SQL: ${sql.replace(/\s+/g, " ").trim().slice(0, 220)}`;
    throw err;
  }
};

// Fixed identifiers keep the seed idempotent and screenshots stable.
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = uid(1); // main demo workspace
const ORG_B = uid(2); // second workspace proving tenant switching
const USER = uid(10);
const PARTNER = uid(11);

const CONTACTS = [
  ["Amara", "Okafor", "amara.okafor@example.com", "+2348031000001", "Lagos", "VIP"],
  ["Tunde", "Bakare", "tunde.bakare@example.com", "+2348031000002", "Abuja", "Speaker"],
  ["Grace", "Adeyemi", "grace.adeyemi@example.com", "+2348031000003", "Lagos", "Volunteer"],
  ["Ibrahim", "Musa", "ibrahim.musa@example.com", "+2348031000004", "Kano", "VIP"],
  ["Chiamaka", "Eze", "chiamaka.eze@example.com", "+2348031000005", "Enugu", "Sponsor"],
  ["Femi", "Adeleke", "femi.adeleke@example.com", "+2348031000006", "Ibadan", ""],
  ["Zainab", "Yusuf", "zainab.yusuf@example.com", "+2348031000007", "Kaduna", "Speaker"],
  ["Emeka", "Nwosu", "emeka.nwosu@example.com", "+2348031000008", "Onitsha", "Volunteer"],
  ["Halima", "Sani", "halima.sani@example.com", "+2348031000009", "Sokoto", ""],
  ["Oluwaseun", "Bello", "seun.bello@example.com", "+2348031000010", "Lagos", "Sponsor"],
  ["Ngozi", "Iheanacho", "ngozi.iheanacho@example.com", "+2348031000011", "Aba", "VIP"],
  ["Segun", "Ogundipe", "segun.ogundipe@example.com", "+2348031000012", "Abeokuta", ""],
  ["Fatima", "Abubakar", "fatima.abubakar@example.com", "+2348031000013", "Maiduguri", "Speaker"],
  ["Kelechi", "Obi", "kelechi.obi@example.com", "+2348031000014", "Uyo", "Volunteer"],
  ["Aisha", "Lawal", "aisha.lawal@example.com", "+2348031000015", "Ilorin", ""],
  ["David", "Ekpo", "david.ekpo@example.com", "+2348031000016", "Calabar", "VIP"],
  ["Blessing", "Umeh", "blessing.umeh@example.com", "+2348031000017", "Awka", ""],
  ["Yusuf", "Danjuma", "yusuf.danjuma@example.com", "+2348031000018", "Jos", "Sponsor"],
];

const TEMPLATES = [
  [
    uid(30),
    "Registration confirmed",
    "Your {{event_name}} registration is confirmed",
    "<p>Hello {{first_name}},</p><p>Your place at {{event_name}} is confirmed. Your registration reference is <strong>{{reference}}</strong>.</p><p>See you there.<br/>The {{event_name}} team</p>",
  ],
  [
    uid(31),
    "Payment reminder",
    "Reminder: complete your {{event_name}} payment",
    "<p>Hello {{first_name}},</p><p>We have not yet received payment for your {{event_name}} registration. Please complete it before {{deadline}} to keep your place.</p>",
  ],
  [
    uid(32),
    "Event SMS reminder",
    "SMS reminder",
    "Workflow: Hi {{first_name}}, your {{event_name}} pass is ready. Reply STOP to opt out.",
  ],
  [
    uid(33),
    "Feedback request",
    "How was {{event_name}}?",
    "<p>Hello {{first_name}},</p><p>Thanks for attending {{event_name}}. Two minutes of feedback would help us improve next year.</p>",
  ],
];

async function main() {
  await client.connect();

  const roles = new Map(
    (await client.query("select key, id from public.roles")).rows.map((r) => [r.key, r.id]),
  );
  const ownerRole = roles.get("owner");
  const adminRole = roles.get("admin") ?? ownerRole;
  const viewerRole = roles.get("viewer") ?? roles.get("member") ?? ownerRole;

  const password = await bcrypt.hash("Workflow2026!", 10);

  await client.query(
    `insert into public.users (id, email, name, password_hash, email_verified, is_platform_admin)
     values ($1, $2, $3, $4, true, false)
     on conflict (id) do update set password_hash = excluded.password_hash`,
    [USER, "founder@workflow.dev", "Prudence Okwubor", password],
  );
  await client.query(
    `insert into public.users (id, email, name, password_hash, email_verified)
     values ($1, $2, $3, $4, true)
     on conflict (id) do nothing`,
    [PARTNER, "ops@meridianacademy.example", "Meridian Ops", password],
  );

  for (const [id, name, slug, plan] of [
    [ORG_A, "Lagos Tech Summit", "lagos-tech-summit", "growth"],
    [ORG_B, "Meridian Academy", "meridian-academy", "free"],
  ]) {
    await client.query(
      `insert into public.organizations (id, name, slug, plan_key) values ($1,$2,$3,$4)
       on conflict (id) do nothing`,
      [id, name, slug, plan],
    );
    await client.query(
      `insert into public.subscriptions (id, org_id, plan_key, status, current_period_end)
       values ($1,$2,$3,'active', now() + interval '24 days') on conflict (id) do nothing`,
      [uid(id === ORG_A ? 40 : 41), id, plan],
    );
  }

  await client.query(
    `insert into public.organization_members (id, org_id, user_id, role, role_id, status)
     values ($1,$2,$3,'owner',$4,'active') on conflict (id) do nothing`,
    [uid(50), ORG_A, USER, ownerRole],
  );
  await client.query(
    `insert into public.organization_members (id, org_id, user_id, role, role_id, status)
     values ($1,$2,$3,'owner',$5,'active'), ($4,$2,$6,'viewer',$7,'active')
     on conflict (id) do nothing`,
    [uid(51), ORG_B, PARTNER, uid(52), ownerRole, USER, viewerRole],
  );
  // The demo identity is deliberately an OWNER in the main workspace and only a
  // VIEWER in the second one, so role resolution is visible in the UI rather
  // than assumed.
  await client.query(
    `update public.organization_members
        set role_id = case when org_id = $1::uuid then $3::uuid else $4::uuid end,
            role = case when org_id = $1 then 'owner' else 'viewer' end,
            status = 'active'
      where user_id = $2 and org_id in ($1, $5)`,
    [ORG_A, USER, adminRole, viewerRole, ORG_B],
  );

  await client.query(
    `insert into public.organization_invitations (id, org_id, email, role, token, status, invited_by_user_id, expires_at)
     values ($1,$2,'newcoordinator@example.com','member',$3,'pending',$4, now() + interval '14 days')
     on conflict (id) do nothing`,
    [uid(55), ORG_A, "inv_demo_0000000000000000000000001", USER],
  );

  for (const [i, [key, label, fieldType, options]] of [
    ["student_id", "Registration ID", "text", []],
    ["department", "Department", "select", ["Engineering", "Design", "Operations"]],
    ["registration_type", "Registration type", "select", ["Delegate", "Speaker", "Press"]],
  ].entries()) {
    await client.query(
      `insert into public.custom_field_definitions (id, org_id, key, label, field_type, options)
       values ($1,$2,$3,$4,$5,$6::jsonb) on conflict (id) do nothing`,
      [uid(60 + i), ORG_A, key, label, fieldType, JSON.stringify(options)],
    );
  }

  const tagIds = new Map();
  for (const [i, tag] of ["VIP", "Speaker", "Sponsor", "Volunteer"].entries()) {
    const id = uid(70 + i);
    tagIds.set(tag, id);
    await client.query(
      `insert into public.tags (id, org_id, name, color) values ($1,$2,$3,$4) on conflict (id) do nothing`,
      [id, ORG_A, tag, ["#3b82f6", "#14b8a6", "#0b1f3b", "#f59e0b"][i]],
    );
  }

  const now = Date.now();
  for (const [i, [first, last, email, phone, city, tag]] of CONTACTS.entries()) {
    const id = uid(100 + i);
    await client.query(
      `insert into public.contacts
         (id, org_id, first_name, last_name, email, phone, company, address, status, custom_fields, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9::jsonb,$10)
       on conflict (id) do nothing`,
      [
        id,
        ORG_A,
        first,
        last,
        email,
        phone,
        i % 3 === 0 ? "Independent" : null,
        city,
        JSON.stringify({ registration_type: tag || "Delegate", student_id: `LTS-${1000 + i}` }),
        new Date(now - (i + 1) * 36e5 * 20),
      ],
    );
    if (tag && tagIds.has(tag)) {
      await client.query(
        `insert into public.contact_tags (contact_id, tag_id) values ($1,$2)
         on conflict (contact_id, tag_id) do nothing`,
        [id, tagIds.get(tag)],
      );
    }
    // Consent provenance: email granted for all, SMS granted for most, and one
    // deliberately revoked so the Communications Center shows a blocked row.
    await client.query(
      `insert into public.contact_channel_consents (id, org_id, contact_id, channel, status, source, evidence)
       values ($1,$2,$3,'email','granted','registration_form','Checked the email updates box on the registration form')
       on conflict (id) do nothing`,
      [uid(400 + i), ORG_A, id],
    );
    if (i !== 5) {
      await client.query(
        `insert into public.contact_channel_consents (id, org_id, contact_id, channel, status, source, evidence)
         values ($1,$2,$3,'sms', $4, 'registration_form','Provided mobile number for event updates')
         on conflict (id) do nothing`,
        [uid(500 + i), ORG_A, id, i === 3 ? "revoked" : "granted"],
      );
    }
  }

  // One hard suppression so the gate is visibly enforced.
  await client.query(
    `insert into public.suppression_entries (id, org_id, channel, address, reason)
     values ($1,$2,'email','grace.adeyemi@example.com','bounce') on conflict (id) do nothing`,
    [uid(600), ORG_A],
  );

  for (const [i, [id, fileName, status, total, valid, invalid, dup]] of [
    [uid(700), "lagos-summit-registrations.xlsx", "committed", 420, 401, 12, 7],
    [uid(701), "speaker-shortlist.csv", "validated", 48, 46, 2, 0],
    [uid(702), "sponsor-contacts.xlsx", "uploaded", 31, 0, 0, 0],
  ].entries()) {
    await client.query(
      `insert into public.imports
         (id, org_id, file_name, file_type, storage_path, total_rows, valid_rows, invalid_rows, duplicate_rows,
          status, columns, mapping, rows, created_by_user_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15)
       on conflict (id) do nothing`,
      [
        id,
        ORG_A,
        fileName,
        fileName.endsWith(".csv") ? "csv" : "xlsx",
        null,
        total,
        valid,
        invalid,
        dup,
        status,
        JSON.stringify(["First name", "Last name", "Email", "Phone", "City"]),
        JSON.stringify({
          "First name": "first_name",
          "Last name": "last_name",
          Email: "email",
          Phone: "phone",
          City: "address",
        }),
        JSON.stringify(CONTACTS.slice(0, 5).map(([f, l, e, p, c]) => ({
          "First name": f,
          "Last name": l,
          Email: e,
          Phone: p,
          City: c,
        }))),
        USER,
        new Date(now - (i + 1) * 864e5),
      ],
    );
  }
  for (const [i, [rowNumber, errors]] of [
    [12, ["Email is not a valid address"]],
    [87, ["Phone is not a valid Nigerian number", "City is required"]],
  ].entries()) {
    await client.query(
      `insert into public.import_errors (id, import_id, row_number, errors, raw_data)
       values ($1,$2,$3,$4::jsonb,'{}'::jsonb) on conflict (id) do nothing`,
      [uid(710 + i), uid(700), rowNumber, JSON.stringify(errors)],
    );
  }

  const campaigns = [
    [
      uid(800),
      "Lagos Tech Summit 2026 — delegate registration",
      "registration",
      "running",
      "https://forms.example.org/lts-2026/register",
    ],
    [
      uid(801),
      "Speaker onboarding confirmations",
      "notification",
      "ready",
      "https://forms.example.org/lts-2026/speakers",
    ],
    [
      uid(802),
      "Volunteer shift sign-up",
      "registration",
      "completed",
      "https://forms.example.org/lts-2026/volunteers",
    ],
  ];
  for (const [i, [id, name, type, status, formUrl]] of campaigns.entries()) {
    await client.query(
      `insert into public.campaigns
         (id, org_id, name, type, status, form_url, form_definition, field_mapping, stats, created_by_user_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)
       on conflict (id) do nothing`,
      [
        id,
        ORG_A,
        name,
        type,
        status,
        formUrl,
        JSON.stringify([
          { name: "first_name", label: "First name", type: "text", required: true },
          { name: "last_name", label: "Last name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: false },
        ]),
        JSON.stringify({
          first_name: "First name",
          last_name: "Last name",
          email: "Email",
          phone: "Phone",
        }),
        JSON.stringify({ total: 18, successful: 14, failed: 2, pending: 2 }),
        USER,
        new Date(now - (i + 1) * 864e5 * 3),
      ],
    );
  }

  const STATUSES = [
    "successful",
    "successful",
    "successful",
    "successful",
    "failed",
    "successful",
    "pending_review",
    "human_action_required",
    "successful",
    "successful",
    "failed",
    "successful",
    "queued",
    "successful",
    "successful",
    "review",
    "successful",
    "successful",
  ];
  for (const [i, status] of STATUSES.entries()) {
    const failed = status === "failed" || status === "human_action_required";
    await client.query(
      `insert into public.campaign_records
         (id, org_id, campaign_id, contact_id, status, failure_category, result_message, attempts, last_attempt_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do nothing`,
      [
        uid(900 + i),
        ORG_A,
        uid(800),
        uid(100 + i),
        status,
        failed ? "validation" : null,
        failed
          ? status === "failed"
            ? "Required field 'Registration ID' rejected by the destination form"
            : "Destination presented a manual verification step — a human must complete this submission"
          : "Registration accepted and acknowledged by the destination form",
        status === "queued" ? 0 : 1,
        status === "queued" ? null : new Date(now - (i + 1) * 36e5),
        new Date(now - (i + 1) * 36e5 * 2),
        new Date(now - i * 36e5),
      ],
    );

    const eventType = failed ? "submission_failed" : "submission_succeeded";
    await client.query(
      `insert into public.activity_events (id, org_id, contact_id, campaign_id, type, message, metadata, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) on conflict (id) do nothing`,
      [
        uid(1000 + i),
        ORG_A,
        uid(100 + i),
        uid(800),
        eventType,
        failed
          ? `Submission for ${CONTACTS[i][0]} ${CONTACTS[i][1]} needs attention`
          : `${CONTACTS[i][0]} ${CONTACTS[i][1]} was submitted successfully`,
        JSON.stringify({ source: "seed" }),
        new Date(now - i * 36e5),
      ],
    );
  }

  for (const [i, [id, name, subject, body]] of TEMPLATES.entries()) {
    await client.query(
      `insert into public.message_templates (id, org_id, name, subject, body)
       values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
      [id, ORG_A, name, subject, body],
    );
  }

  const messagePlan = [
    [0, "email", "sent", "resend"],
    [1, "email", "sent", "resend"],
    [2, "sms", "sent", "termii"],
    [4, "email", "delivered", "resend"],
    [5, "email", "bounced", "resend"],
    [6, "email", "queued", null],
    [7, "sms", "failed", "termii"],
  ];
  for (const [i, [contactIdx, channel, status, provider]] of messagePlan.entries()) {
    const id = uid(1100 + i);
    await client.query(
      `insert into public.messages
         (id, org_id, contact_id, campaign_id, template_id, channel, subject, body, status, provider, provider_message_id, sent_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do nothing`,
      [
        id,
        ORG_A,
        uid(100 + contactIdx),
        uid(800),
        uid(30),
        channel,
        channel === "email" ? "Your Lagos Tech Summit registration is confirmed" : " ",
        channel === "email"
          ? "<p>Hello, your place at Lagos Tech Summit 2026 is confirmed.</p>"
          : "Workflow: your Lagos Tech Summit pass is ready.",
        status,
        provider ?? "pending_provider",
        status === "queued" ? null : `prov_${1000 + i}`,
        status === "queued" ? null : new Date(now - i * 72e5),
        new Date(now - i * 72e5),
      ],
    );
    if (status !== "queued") {
      await client.query(
        `insert into public.message_events (id, org_id, message_id, provider, provider_event_id, status, detail, occurred_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
        [
          uid(1200 + i),
          ORG_A,
          id,
          provider ?? "pending_provider",
          `evt_${2000 + i}`,
          status === "sent" ? "accepted" : status,
          status === "bounced" ? "hard_bounce: mailbox unavailable" : null,
          new Date(now - i * 72e5),
        ],
      );
    }
  }

  const outboxPlan = [
    ["email", "pending", "demo:outbox:pending:1", "Registration confirmed → amara.okafor@example.com"],
    ["sms", "pending", "demo:outbox:pending:2", "Pass ready SMS → tunde.bakare@example.com"],
    ["email", "ambiguous", "demo:outbox:ambiguous:1", "Timeout after request was sent — outcome unknown"],
    ["sms", "exhausted", "demo:outbox:exhausted:1", "Provider rejected sender ID after 5 attempts"],
    ["telegram", "sent", "demo:outbox:telegram:1", "Daily operations summary delivered to founder chat"],
  ];
  for (const [i, [eventType, status, key, note]] of outboxPlan.entries()) {
    await client.query(
      `insert into public.outbox_events
         (id, org_id, event_type, idempotency_key, provider, attempt_count, max_attempts, status, last_error, payload, created_at)
       values ($1,$2,$3,$4,$5,$6,5,$7,$8,$9::jsonb,$10) on conflict (idempotency_key) do nothing`,
      [
        uid(1300 + i),
        ORG_A,
        eventType,
        key,
        eventType === "email" ? "resend" : eventType === "sms" ? "termii" : "telegram",
        status === "pending" ? 0 : status === "sent" ? 1 : 5,
        status,
        status === "pending" ? null : note,
        JSON.stringify({ note }),
        new Date(now - i * 18e5),
      ],
    );
  }

  const period = new Date();
  period.setDate(1);
  for (const [i, [metric, count]] of [
    ["contact_created", 18],
    ["import_row", 499],
    ["submission_attempt", 18],
    ["email_sent", 7],
    ["sms_sent", 4],
  ].entries()) {
    await client.query(
      `insert into public.usage_counters (id, org_id, metric, period_start, count) values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      [uid(1400 + i), ORG_A, metric, period.toISOString().slice(0, 10), count],
    );
  }

  for (const [i, [action, entityType, meta]] of [
    ["permission_denied", "security", { permission: "sms:send", context: "vendor role" }],
    ["member_invited", "organization", { email: "newcoordinator@example.com", role: "member" }],
    ["import_committed", "import", { file: "lagos-summit-registrations.xlsx", rows: 401 }],
    ["telegram_status", "telegram_bot", { chat_id: "allowlisted-founder" }],
  ].entries()) {
    await client.query(
      `insert into public.audit_logs (id, org_id, user_id, action, entity_type, metadata, created_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7) on conflict (id) do nothing`,
      [uid(1500 + i), ORG_A, USER, action, entityType, JSON.stringify(meta), new Date(now - i * 54e5)],
    );
  }

  const counts = await client.query(`
    select
      (select count(*) from public.contacts)::int as contacts,
      (select count(*) from public.campaigns)::int as campaigns,
      (select count(*) from public.imports)::int as imports,
      (select count(*) from public.message_templates)::int as templates,
      (select count(*) from public.messages)::int as messages,
      (select count(*) from public.outbox_events)::int as outbox,
      (select count(*) from public.organizations)::int as orgs
  `);
  console.log("seeded:", counts.rows[0]);
  console.log("login: founder@workflow.dev / Workflow2026!  (development branch only)");

  await client.end();
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
