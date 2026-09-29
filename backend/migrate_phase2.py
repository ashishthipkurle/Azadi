import asyncio
from database import db

async def migrate():
    await db.pool.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;")
    await db.pool.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';")
    print("Migration complete")

if __name__ == "__main__":
    asyncio.run(migrate())
