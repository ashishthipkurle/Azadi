import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

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
cur.execute("NOTIFY pgrst, 'reload schema';")

conn.commit()
print('Comments table created and schema reloaded successfully!')
