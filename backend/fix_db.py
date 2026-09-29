import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute('ALTER TABLE posts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;')
cur.execute('ALTER TABLE posts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;')
cur.execute("NOTIFY pgrst, 'reload schema';")
conn.commit()
print('Success')
