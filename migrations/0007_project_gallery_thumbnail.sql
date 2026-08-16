ALTER TABLE project_gallery_images ADD COLUMN is_thumbnail INTEGER NOT NULL DEFAULT 0;

-- Flag the existing gallery row that already matches the project's current thumbnail URL
-- (picks the earliest-sorted match if duplicates exist, so exactly one row gets flagged).
UPDATE project_gallery_images
SET is_thumbnail = 1
WHERE id IN (
  SELECT pgi.id
  FROM project_gallery_images pgi
  JOIN projects ON projects.id = pgi.project_id
  WHERE projects.image_url IS NOT NULL
    AND projects.image_url != ''
    AND pgi.url = projects.image_url
    AND pgi.id = (
      SELECT pgi2.id FROM project_gallery_images pgi2
      WHERE pgi2.project_id = pgi.project_id AND pgi2.url = projects.image_url
      ORDER BY pgi2.sort_order ASC, pgi2.created_at ASC
      LIMIT 1
    )
);

-- For any project whose thumbnail URL has no matching gallery row at all, clone it in as one
-- (sort_order -1 so it sorts first), so no published project loses its visible thumbnail.
INSERT INTO project_gallery_images (id, project_id, url, filename, alt_text, sort_order, is_thumbnail, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       projects.id,
       projects.image_url,
       projects.image_filename,
       '',
       -1,
       1,
       projects.updated_at,
       projects.updated_at
FROM projects
WHERE projects.image_url IS NOT NULL
  AND projects.image_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM project_gallery_images
    WHERE project_gallery_images.project_id = projects.id
      AND project_gallery_images.url = projects.image_url
  );
