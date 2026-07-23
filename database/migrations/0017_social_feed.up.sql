CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(2000),
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR photo_url IS NOT NULL)
);
CREATE INDEX idx_posts_author_created ON posts(author_id, created_at DESC);

CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
