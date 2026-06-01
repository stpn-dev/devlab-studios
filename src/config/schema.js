// Schema.js - JSON-LD structured data helpers
export const getPersonSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Stephen Rey G. Agustinez',
  alternateName: 'AgustinezTechVA',
  url: 'https://www.devlabstudios.com',
  description:
    'Software engineer and AI automation specialist building backend systems, API integrations, websites, and workflow automations for modern businesses worldwide.',
  jobTitle: 'Software Engineer & AI Automation Specialist',
  knowsAbout: [
    'Website Development',
    'Software Engineering',
    'Backend Development',
    'AI Automation',
    'Workflow Automation',
    'Business Process Automation',
    'Java',
    'Spring Boot',
    'React',
    'Next.js',
    'Tailwind CSS',
    'Laravel',
    'Zapier',
    'n8n',
    'Make.com',
    'REST APIs',
    'SQL',
    'API Integrations',
    'Full Stack Development',
    'Power BI',
    'CRM Automation',
    'Data Modeling',
  ],
  hasOccupation: {
    '@type': 'Occupation',
    name: 'Software Engineer & AI Automation Specialist',
    description:
      'Builds backend systems, websites, API integrations, and AI-driven automation systems for businesses, enabling reliable delivery, process efficiency, and operational scaling.',
    skills:
      'Java, Spring Boot, Laravel, React, Next.js, SQL, REST APIs, Zapier, n8n, Make.com, Business Process Automation, Full Stack Development',
    occupationLocation: {
      '@type': 'Country',
      name: 'Philippines',
    },
  },
  offers: [
    {
      '@type': 'Offer',
      name: 'Website Development',
      description:
        'Conversion-focused websites, landing pages, and full-stack web applications built with React, Tailwind CSS, and Laravel.',
      url: 'https://www.devlabstudios.com/portfolio',
    },
    {
      '@type': 'Offer',
      name: 'AI Automation & Workflow Automation',
      description:
        'Business process automations using Zapier, n8n, Make.com, OpenAI, and Claude. Includes email automation, CRM integration, lead enrichment, and AI-assisted workflow systems.',
      url: 'https://www.devlabstudios.com/portfolio',
    },
    {
      '@type': 'Offer',
      name: 'Backend & API Integration Support',
      description:
        'Backend and integration work across Java, Spring Boot, Laravel, SQL-backed workflows, REST APIs, and structured data handling for production-ready systems.',
      url: 'https://www.devlabstudios.com/portfolio',
    },
  ],
  areaServed: 'Worldwide',
  worksFor: {
    '@type': 'Organization',
    name: 'DevLab Studios',
    url: 'https://www.devlabstudios.com',
  },
  sameAs: [
    'https://www.linkedin.com/in/stephen-rey-agustinez-8b86041b3',
    'https://github.com/stpn-dev',
  ],
  image: 'https://www.devlabstudios.com/screenshots/portfolio-home.png',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'PH',
    addressRegion: 'Cebu',
    addressLocality: 'Lapu-Lapu City',
  },
})

export const getPortfolioItemSchema = (project) => ({
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  name: project.title,
  description: project.description,
  url: project.link || `https://www.devlabstudios.com/portfolio#${project.id}`,
  image: project.image,
  author: {
    '@type': 'Person',
    name: 'Stephen Rey G. Agustinez',
    jobTitle: 'Software Engineer & AI Automation Specialist',
  },
  datePublished: project.datePublished || '2026-03-11',
})

export const getOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'DevLab Studios',
  url: 'https://www.devlabstudios.com',
  description:
    'DevLab Studios provides software engineering, website development, backend integration, and AI automation services for businesses worldwide.',
  logo: 'https://www.devlabstudios.com/devlabstudios-logo-only.png',
  founder: {
    '@type': 'Person',
    name: 'Stephen Rey G. Agustinez',
    jobTitle: 'Software Engineer & AI Automation Specialist',
  },
  knowsAbout: [
    'Website Development',
    'Software Engineering',
    'Backend Development',
    'AI Automation',
    'Workflow Automation',
    'Business Process Automation',
    'React Development',
    'Spring Boot',
    'Laravel',
    'Zapier',
    'n8n',
  ],
  areaServed: 'Worldwide',
  sameAs: [
    'https://www.linkedin.com/in/stephen-rey-agustinez-8b86041b3',
    'https://github.com/stpn-dev',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'Customer Support',
    url: 'https://www.devlabstudios.com/contact',
  },
})

export const getWebsiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'DevLab Studios – Software Engineer & AI Automation Specialist',
  url: 'https://www.devlabstudios.com',
  description:
    'Portfolio and resume of Stephen Agustinez — software engineer and AI automation specialist building websites, backend systems, integrations, and workflow automations for modern businesses.',
  publisher: {
    '@type': 'Organization',
    name: 'DevLab Studios',
    logo: 'https://www.devlabstudios.com/devlabstudios-logo-only.png',
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://www.devlabstudios.com/?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
})
