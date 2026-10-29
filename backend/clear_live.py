import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
import database as db

async def clear():
    await db.init_db()
    sessions = await db.find_many('live_sessions', {'status': 'live'})
    print(f'Found {len(sessions)} live sessions')
    for s in sessions:
        await db.update_one('live_sessions', {'id': s['id']}, {
            'status': 'ended',
            'ended_at': datetime.now(timezone.utc).isoformat()
        })
        print(f"Ended session {s['id']}")
    print("All stuck sessions successfully ended.")

if __name__ == '__main__':
    asyncio.run(clear())
