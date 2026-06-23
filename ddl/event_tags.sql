-- event_tags: events と tags の多対多の結びつき。
--   どちらかが消えたら結びつきも消える（ON DELETE CASCADE）。
CREATE TABLE event_tags (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX event_tags_tag_idx ON event_tags(tag_id);
