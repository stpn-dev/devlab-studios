-- A global (organization_id NULL) built-in scoring profile every new
-- session can reference immediately, matching the spec's "global default
-- ruleset" design (§4.3). Organizations can add their own later.
INSERT INTO scoring_rulesets (id, organization_id, name, rules_version, scoring_method, target_score, win_by, format, active, created_at, updated_at)
SELECT 'usap-2026-sideout-11-doubles', NULL, 'Side-Out to 11, Win by 2 (Doubles)', 'USAP-2026', 'SIDE_OUT', 11, 2, 'DOUBLES', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM scoring_rulesets WHERE id = 'usap-2026-sideout-11-doubles');
