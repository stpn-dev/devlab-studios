ALTER TABLE resources ADD COLUMN slug TEXT;
ALTER TABLE resources ADD COLUMN content_type TEXT NOT NULL DEFAULT 'guide';
ALTER TABLE resources ADD COLUMN body_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN cover_image_url TEXT;
ALTER TABLE resources ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resources ADD COLUMN author_name TEXT NOT NULL DEFAULT 'DevLab Studios';
ALTER TABLE resources ADD COLUMN published_at TEXT;
ALTER TABLE resources ADD COLUMN reading_time_minutes INTEGER;
ALTER TABLE resources ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;

UPDATE resources
SET
  slug = COALESCE(NULLIF(slug, ''), id),
  content_type = COALESCE(NULLIF(content_type, ''), 'guide'),
  body_markdown = CASE
    WHEN body_markdown IS NULL OR body_markdown = '' THEN summary
    ELSE body_markdown
  END,
  cover_image_url = COALESCE(cover_image_url, ''),
  tags_json = COALESCE(NULLIF(tags_json, ''), '[]'),
  author_name = COALESCE(NULLIF(author_name, ''), 'DevLab Studios'),
  is_featured = COALESCE(is_featured, 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_slug ON resources(slug);
CREATE INDEX IF NOT EXISTS idx_resources_type_status_sort ON resources(content_type, status, sort_order);
