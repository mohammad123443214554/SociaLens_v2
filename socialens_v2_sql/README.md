# SociaLens V2 SQL

This folder is the source of truth for SQL scripts associated with SociaLens V2.

## Important: live database safety

- Do **not** run the legacy setup script against the existing SociaLens V2 Supabase project.
- `000_legacy_initial_setup_reference.sql` is preserved for reference and fresh-database history only. It is not a migration for the live V2 database.
- Do not apply SQL automatically when adding a feature. First review the SQL, explain what it changes, and only run it after explicit confirmation.
- Future incremental changes should use a new numbered file, for example `001_add_feature_name.sql`, `002_update_feature_name.sql`.
- Each script should explain its purpose, expected effect, and any rollback or data-loss considerations in comments.
- Keep secrets, service-role keys, passwords, and private user data out of this folder.

## Running a future migration

1. Review the new SQL file and confirm it is intended for the current SociaLens V2 schema.
2. Back up important data where appropriate.
3. Open the SociaLens V2 Supabase project's SQL Editor.
4. Paste and run only the approved migration.
5. Verify the affected feature and database afterward.

No SQL in this folder is automatically executed by the app or GitHub.
