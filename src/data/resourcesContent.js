import { guideArticles } from './insights/guides.js'
import { aiUpdateArticles } from './insights/aiUpdates.js'
import { opsNoteArticles } from './insights/opsNotes.js'

/**
 * The Insights library.
 *
 * This is the static fallback `loadArticlesContent()` uses when D1 is
 * unreachable, and it is the source `scripts/cms/generate-insights-seed.mjs`
 * generates the CMS update from. One copy means the fallback cannot quietly
 * diverge from what the site publishes — which is exactly how the Solutions
 * and Insights SEO records ended up controlling nothing.
 *
 * Split by topic across src/data/insights/ so no one file carries the whole
 * library. `contentType` values are the ids in src/config/insightTopics.js.
 *
 * `readingTimeMinutes` in these records is NOT authoritative and is not read at
 * runtime — src/lib/content/readingTime.ts derives it from the body, so the
 * number on the page cannot disagree with the article under it. The field
 * remains only because the CMS column does.
 */
export const resourcesContent = {
  posts: [...guideArticles, ...aiUpdateArticles, ...opsNoteArticles],
  playbook: [
    'Map one workflow from trigger to final handoff.',
    'Identify where work waits on a person, inbox, or spreadsheet.',
    'Define what should be automated, drafted, routed, or only reported.',
    'Keep humans in the loop where risk, judgment, or client trust matters.',
  ],
}

export default resourcesContent
