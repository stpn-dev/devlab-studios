// src/data/portfolio.js
// Projects updated to match the provided workflow screenshots + resume-deployed projects.
// Put your screenshots in: src/assets/projects/
// IMPORTANT: Filenames must match exactly.

import project1 from "../assets/projects/project1-content-repurposing.png";
import project2Escalation from "../assets/projects/project2-escalation-email.png";
import project2QuoteFollowUp from "../assets/projects/project2-quote-followup.png";
import project2Combined from "../assets/projects/project2-combined-automation.png";
import project3 from "../assets/projects/project3-leads-enrichment.png";
import project4 from "../assets/projects/project4-xero-to-asana.png";
import project5 from "../assets/projects/project5-gmail-drive-sort.png";
import project6 from "../assets/projects/project6-fb-messenger-ai.png";
import project7 from "../assets/projects/project7-ai-social-creator.png";
import project8ArvGeocoding from "../assets/projects/ARV_Generate_Proposed_v1.4_Enterprise_Geocoding.png";
import project9GuestResearcher from "../assets/projects/Guest-Researcher-from-a-booked-calendar-client.png";

// Website sample screenshots
import sampleReact from "../assets/projects/sample-react-landing.png";
import sampleHtml from "../assets/projects/sample-html-landing.png";
import sampleFullstack from "../assets/projects/sample-fullstack-landing.png";
import sampleLocalService from "../assets/projects/sample-local-service-landing.png";
import sampleEcommerce from "../assets/projects/sample-ecommerce-landing.png";

export const portfolioItems = [
  // --- Automation / AI Automation projects (from screenshots) ---
  // --- Website Buildouts (Samples) ---
  {
    id: "w1-react-modern",
    title: "Modern React Landing Page",
    description:
      "A modern, animated landing page built with React and Tailwind CSS. Showcases a tech-focused, responsive design.",
    techStack: ["React", "Tailwind CSS"],
    liveUrl: "/landing-sample-react",
    sourceUrl: "#",
    image: sampleReact,
    type: "Website",
  },
  {
    id: "w2-html-minimalist",
    title: "Minimalist HTML/CSS/JS",
    description:
      "A clean, minimalist landing page using only HTML, CSS, and vanilla JavaScript. Fast, lightweight, and static.",
    techStack: ["HTML", "CSS", "JavaScript"],
    liveUrl: "/landing-sample-html",
    sourceUrl: "#",
    image: sampleHtml,
    type: "Website",
  },
  {
    id: "w4-laravel-fullstack",
    title: "Full Stack (Laravel + MariaDB)",
    description:
      "A dynamic full stack landing page with backend interaction, built using Laravel (PHP) and MariaDB. Features a contact form and dashboard UI.",
    techStack: ["Laravel", "PHP", "MariaDB", "Blade"],
    liveUrl: "/landing-sample-fullstack",
    sourceUrl: "#",
    image: sampleFullstack,
    type: "Website",
  },
  {
    id: "w5-local-service",
    title: "Local Service Business",
    description:
      "A local lead-generation website sample with strong call CTAs, booking form, trust stats, and service cards.",
    techStack: ["React", "Tailwind CSS", "Lead Generation UX"],
    liveUrl: "/landing-sample-local-service",
    sourceUrl: "#",
    image: sampleLocalService,
    type: "Website",
  },
  {
    id: "w6-ecommerce",
    title: "E-commerce Product Landing",
    description:
      "A conversion-focused e-commerce design with featured product block, product cards, ratings, and purchase CTA flow.",
    techStack: ["React", "Tailwind CSS", "E-commerce UI"],
    liveUrl: "/landing-sample-ecommerce",
    sourceUrl: "#",
    image: sampleEcommerce,
    type: "Website",
  },
  {
    id: "p1-content-repurposing",
    title: "Content Repurposing Automation",
    description:
      "Automation that repurposes content from a single uploaded file by filtering inputs, generating AI outputs, and routing results into multiple publishing paths (e.g., Facebook Pages and LinkedIn).",
    techStack: ["Zapier", "Google Drive", "AI by Zapier", "Facebook Pages", "LinkedIn"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project1,
    type: "Automation",
  },
  {
    id: "p2-escalation-email",
    title: "Automated Email Response for Escalations",
    description:
      "Scheduled workflow that checks tasks and sends email responses for escalations, keeping communication consistent and reducing manual handling.",
    techStack: ["Zapier", "Schedule", "Asana", "Gmail"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project2Escalation,
    type: "Automation",
  },
  {
    id: "p2-quote-follow-up",
    title: "Quote Follow-up Automation",
    description:
      "Weekly scheduled automation that finds relevant tasks and sends quote follow-up emails to improve response rates and maintain consistent outreach.",
    techStack: ["Zapier", "Schedule", "Asana", "Gmail"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project2QuoteFollowUp,
    type: "Automation",
  },
  {
    id: "p2-combined-automation",
    title: "Combined Multi-step Client Workflow Automation",
    description:
      "End-to-end workflow triggered by task updates that branches into multiple paths (ready to start, no response, approved, paid & closed), creates folders/subtasks, and sends appropriate email sequences per service.",
    techStack: ["Zapier", "Asana", "Gmail", "Google Drive", "Paths/Router"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project2Combined,
    type: "Automation",
  },
  {
    id: "p3-leads-enrichment",
    title: "Automated Leads Enrichment",
    description:
      "Webhook-driven enrichment that formats incoming lead data, enriches via external lookup, routes by priority, logs high-priority leads to Sheets, notifies stakeholders, and emails outcomes.",
    techStack: ["Zapier", "Webhooks", "Formatter", "Google Sheets", "Slack", "Gmail"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project3,
    type: "Automation",
  },
  {
    id: "p4-xero-to-asana",
    title: "Export Xero Transactions → Upload CSV to Asana",
    description:
      "Pulls account transactions from Xero via API, routes/iterates records, writes and aggregates data in Google Sheets, then uploads the generated CSV/attachment to Asana for processing and tracking.",
    techStack: ["Make (Integromat)", "Xero API", "Google Sheets", "Iterator/Router", "Asana"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project4,
    type: "Automation",
  },
  {
    id: "p5-gmail-attachments-drive",
    title: "Auto-sort Gmail Attachments to Google Drive",
    description:
      "Watches Gmail, extracts attachments, optionally uses Gemini AI for processing, uploads files to Drive, logs metadata to Google Sheets, and sends confirmation emails for visibility.",
    techStack: ["Make (Integromat)", "Gmail", "Google Drive", "Google Sheets", "Gemini AI"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project5,
    type: "Automation",
  },
  {
    id: "p6-messenger-ai-agent",
    title: "Facebook Messenger AI Agent",
    description:
      "Webhook-based Messenger agent that filters events, fetches context, generates AI replies, triggers downstream actions via HTTP, and responds back through the webhook flow.",
    techStack: ["n8n", "Webhooks", "AI Agent", "HTTP Request", "Gemini Chat Model", "Memory"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project6,
    type: "AI Automation",
  },
  {
    id: "p7-ai-social-content",
    title: "AI Social Media Content Creator",
    description:
      "Scheduled pipeline that generates quote copy, checks duplicates in Google Sheets, fetches weather data, generates images, saves image URLs, and publishes to Facebook using Graph API.",
    techStack: ["n8n", "Schedule", "OpenWeatherMap", "Google Sheets", "Facebook Graph API", "Gemini Chat Model"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project7,
    type: "AI Automation",
  },
  {
    id: "p8-arv-enterprise-geocoding",
    title: "ARV Enterprise Geocoding Automation",
    description:
      "Automation workflow for generating proposed geocoding outputs from business records, structuring location data for downstream review and enterprise mapping use.",
    techStack: ["Automation Workflow", "Geocoding", "Data Structuring", "Review Pipeline"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project8ArvGeocoding,
    type: "Automation",
  },
  {
    id: "p9-guest-researcher-calendar-client",
    title: "Guest Researcher From Booked Calendar Client",
    description:
      "Booked-calendar intake automation that turns client scheduling data into a guest research workflow, helping the team prepare context and next-step actions before engagement.",
    techStack: ["Calendar Intake", "Client Routing", "Research Workflow", "Automation"],
    liveUrl: "#",
    sourceUrl: "#",
    image: project9GuestResearcher,
    type: "Automation",
  },
];
