import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;")
cur.execute("NOTIFY pgrst, 'reload schema';")

conn.commit()
print('Added comment_count to posts table and reloaded schema successfully!')
