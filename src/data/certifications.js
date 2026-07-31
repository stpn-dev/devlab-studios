// Static fallback for the certifications collection — mirrors the real
// rows seeded in migrations/0005_seed_certifications.sql so the Profile
// page shows accurate data even without a D1 binding configured.
export const certifications = [
  {
    id: 'cert-zapier-no-code-automation',
    name: 'No Code Automation with Zapier',
    issuer: 'Technical Virtual Assistants PH',
    issuedDate: '2025-11-25',
    credentialUrl: '',
    badgeImageUrl: '',
    sortOrder: 10,
  },
  {
    id: 'cert-make-no-code-automation',
    name: 'No Code Automation with Make.com',
    issuer: 'Technical Virtual Assistants PH',
    issuedDate: '2025-12-02',
    credentialUrl: '',
    badgeImageUrl: '',
    sortOrder: 20,
  },
  {
    id: 'cert-n8n-ai-automation',
    name: 'AI Automation with n8n',
    issuer: 'Technical Virtual Assistants PH',
    issuedDate: '2025-12-16',
    credentialUrl: '',
    badgeImageUrl: '',
    sortOrder: 30,
  },
  {
    id: 'cert-highlevel-crm',
    name: 'HighLevel CRM',
    issuer: 'Tara AI Community+',
    issuedDate: '2026-06-24',
    credentialUrl: '',
    badgeImageUrl: '',
    sortOrder: 40,
  },
]

export default certifications
