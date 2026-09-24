# Muse Spark — start here

1. Read `Workflow_Master_PRD_v2.md`; paste `Workflow_Muse_Spark_Build_Brief.txt` into your initial prompt (under 10,000 chars).
2. Import `Existing_Workflow_App_Source.zip` as the existing application; inspect before implementing and preserve useful code. If ZIP imports are unsupported, put source in a connected Git repo.
3. Use the approved `Workflow_Brand_Assets/Workflow_Brand_Reference.png` as the identity source. Icons in the folder are separate generated interpretations/preview assets; check against the source board.
4. Do a read-only repo audit and return a keep/refactor/replace plan, auth/DB migration plan, a visual design-system preview and missing-capability list before destructive changes.
5. Clarify that choosing Clerk + Neon is the **new recommended** stack, replacing earlier Supabase-Auth and TanStack-Start concepts only upon founder approval. Since this repository is already Next.js + Drizzle, keep its framework by default unless there's an explicit reason to migrate.
6. Original editable wordmark/vector and true logo font are not in this package. Do not claim Manrope is the original logo font.
7. Keep all secrets/configuration out of prompts, screenshots and public repositories.
