import asyncio
import sys
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
sys.path.insert(0, os.path.abspath("backend"))

import database as db

async def main():
    await db.init_db()
    await db.delete_one("posts", {"title": "The river is rising. The village is still waiting."})
    await db.delete_one("posts", {"title": "Inside the last independent print room"})
    print("Deleted hardcoded posts")

if __name__ == "__main__":
    asyncio.run(main())
