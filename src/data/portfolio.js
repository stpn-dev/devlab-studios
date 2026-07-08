// src/data/portfolio.js
// Static portfolio fallback. D1-backed API data should match these records during migration.

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
import project10AutomatedLeadQualification from "../assets/projects/Automated_Lead_Qualification.png";
import project11BuyerIntelligence from "../assets/projects/Wholesaling_BuyerIntelligence_v1D_Improvements.png";
import sampleReact from "../assets/projects/sample-react-landing.png";
import sampleHtml from "../assets/projects/sample-html-landing.png";
import sampleFullstack from "../assets/projects/sample-fullstack-landing.png";
import sampleLocalService from "../assets/projects/sample-local-service-landing.png";
import sampleEcommerce from "../assets/projects/sample-ecommerce-landing.png";
import { projectRecords } from "./projectRecords";

const imagesByFilename = {
  "project1-content-repurposing.webp": project1,
  "project2-escalation-email.webp": project2Escalation,
  "project2-quote-followup.webp": project2QuoteFollowUp,
  "project2-combined-automation.webp": project2Combined,
  "project3-leads-enrichment.webp": project3,
  "project4-xero-to-asana.webp": project4,
  "project5-gmail-drive-sort.webp": project5,
  "project6-fb-messenger-ai.webp": project6,
  "project7-ai-social-creator.webp": project7,
  "ARV_Generate_Proposed_v1.4_Enterprise_Geocoding.webp": project8ArvGeocoding,
  "Guest-Researcher-from-a-booked-calendar-client.webp": project9GuestResearcher,
  "Automated_Lead_Qualification.webp": project10AutomatedLeadQualification,
  "Wholesaling_BuyerIntelligence_v1D_Improvements.webp": project11BuyerIntelligence,
  "sample-react-landing.webp": sampleReact,
  "sample-html-landing.webp": sampleHtml,
  "sample-fullstack-landing.webp": sampleFullstack,
  "sample-local-service-landing.webp": sampleLocalService,
  "sample-ecommerce-landing.webp": sampleEcommerce,
};

export const portfolioItems = projectRecords.map(({ imageFilename, sortOrder, status, ...project }) => ({
  ...project,
  sortOrder,
  status,
  imageFilename,
  image: imagesByFilename[imageFilename],
}));
