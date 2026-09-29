import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

cur.execute("ALTER TABLE messages DISABLE ROW LEVEL SECURITY;")
cur.execute("NOTIFY pgrst, 'reload schema';")

conn.commit()
print('Disabled RLS on messages table and reloaded schema successfully!')
