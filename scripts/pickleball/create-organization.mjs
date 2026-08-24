import { randomUUID } from 'node:crypto'

const [name, slug, adminEmail] = process.argv.slice(2)

if (!name || !slug || !adminEmail) {
  console.error('Usage: node scripts/pickleball/create-organization.mjs "<name>" "<slug>" "<admin-email>"')
  process.exit(1)
}

const now = new Date().toISOString()
const organizationId = randomUUID()
const membershipId = randomUUID()

const sql = `
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES ('${organizationId}', '${name.replace(/'/g, "''")}', '${slug.replace(/'/g, "''")}', '${now}', '${now}');

INSERT INTO organization_memberships (id, organization_id, user_id, invited_email, role, status, created_at, updated_at)
VALUES ('${membershipId}', '${organizationId}', NULL, '${adminEmail.trim().toLowerCase().replace(/'/g, "''")}', 'ADMIN', 'ACTIVE', '${now}', '${now}');
`.trim()

console.log(sql)
console.error(`\n-- Organization id: ${organizationId}`)
console.error('-- Apply with: npx wrangler d1 execute devlab-pickleball --local --file=<this output saved to a file>')
