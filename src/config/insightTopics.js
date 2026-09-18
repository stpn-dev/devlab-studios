/**
 * The three things the Insights section publishes.
 *
 * One registry so the public filter chips, the card badges and the CMS editor
 * cannot describe the same article differently. The ids are the values stored
 * in `articles.content_type`.
 *
 * The labels are not derivable from the ids — "ai-update" would render as
 * "Ai-update" if the page went on capitalising the raw value, which is what it
 * used to do when the only values were single words.
 */
export const INSIGHT_TOPICS = [
  {
    id: 'guide',
    label: 'Guides',
    description: 'How to actually do a thing, start to finish.',
  },
  {
    id: 'ai-update',
    label: 'AI Updates',
    description: 'What changed in AI, and what it means for a working business.',
  },
  {
    id: 'ops-note',
    label: 'Operational Notes',
    description: 'Field notes on running modern workflows day to day.',
  },
]

export const INSIGHT_TOPIC_IDS = INSIGHT_TOPICS.map((topic) => topic.id)

/**
 * Values written before the taxonomy was named. Kept so an article that was
 * never migrated still lands in a real bucket instead of disappearing from
 * every filter.
 */
const LEGACY_TOPIC_IDS = {
  news: 'ai-update',
  insight: 'ops-note',
  guides: 'guide',
}

/** @param {string} value a stored `content_type` */
export function normalizeTopicId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (INSIGHT_TOPIC_IDS.includes(id)) return id
  return LEGACY_TOPIC_IDS[id] || 'guide'
}

/** @param {string} value a stored `content_type` */
export function topicLabel(value) {
  const id = normalizeTopicId(value)
  return INSIGHT_TOPICS.find((topic) => topic.id === id)?.label || 'Guides'
}
