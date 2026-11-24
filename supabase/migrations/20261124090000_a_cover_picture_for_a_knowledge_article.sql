-- A cover picture for a knowledge article.
--
-- The article list is becoming a grid of cards rather than a run of text
-- rows, and a card wants a picture. Articles already carry picture
-- attachments, so a card can fall back to the first of those - this column is
-- for choosing one deliberately instead.
--
-- It holds a PATH in the private knowledge-attachments bucket, not a URL:
-- knowledge imagery is clinical, and the rest of the app already reaches it
-- through a signed URL rather than a public link. The grid signs the paths of
-- the page it is showing, in one call.
--
-- Nullable, no default, not NOT NULL: the CURRENTLY PUBLISHED build never
-- reads or writes it, so it keeps working untouched until the next publish.

alter table public.knowledge_articles
  add column if not exists cover_image_path text;

comment on column public.knowledge_articles.cover_image_path is
  'Path in the private knowledge-attachments bucket of the card cover. Null falls back to the first picture attachment, then to a plain banner.';
