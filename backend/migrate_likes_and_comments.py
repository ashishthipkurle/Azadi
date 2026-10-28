import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

print("Applying migrations for likes and comments...")

# 1. Posts table columns
cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;")
cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;")

# 2. Likes table
cur.execute("""
CREATE TABLE IF NOT EXISTS likes (
    id          BIGSERIAL PRIMARY KEY,
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id)
);
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);")
cur.execute("CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);")
cur.execute("ALTER TABLE likes DISABLE ROW LEVEL SECURITY;")
cur.execute("GRANT ALL ON TABLE likes TO anon, authenticated;")

# 3. Comments table
cur.execute("""
CREATE TABLE IF NOT EXISTS comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name   TEXT NOT NULL,
    body        TEXT NOT NULL,
    parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);")
cur.execute("CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);")
cur.execute("ALTER TABLE comments DISABLE ROW LEVEL SECURITY;")
cur.execute("GRANT ALL ON TABLE comments TO anon, authenticated;")

# 4. Reload PostgREST schema cache
cur.execute("NOTIFY pgrst, 'reload schema';")

conn.commit()
cur.close()
conn.close()

print("Successfully migrated likes and comments tables!")
