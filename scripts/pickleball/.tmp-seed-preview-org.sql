INSERT OR IGNORE INTO organizations (id, name, slug, created_at, updated_at)
VALUES ('8e41482c-8da8-47b6-b806-c2fab7a3e2ac', 'Devlab Pickleball Test Org', 'devlab-pickleball-test', '2026-08-26T05:05:13.718Z', '2026-08-26T05:05:13.718Z');

INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
VALUES ('39299f08-c8a5-4335-a255-11cd06616974', '8e41482c-8da8-47b6-b806-c2fab7a3e2ac', NULL, 'stpnrey.agustinez@gmail.com', 'ADMIN', 'ACTIVE', '2026-08-26T05:05:13.718Z', '2026-08-26T05:05:13.718Z');
