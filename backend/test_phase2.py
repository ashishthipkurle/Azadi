import pytest
from fastapi.testclient import TestClient
from database import get_client, db
from server import app

client = TestClient(app)

def get_admin_token():
    # Use existing login endpoint for admin
    res = client.post("/api/auth/login", json={"email": "admin@freepress.in", "password": "admin123"})
    assert res.status_code == 200
    return res.json()["access_token"]

def get_reporter_token():
    res = client.post("/api/auth/login", json={"email": "rhea@freepress.in", "password": "reporter123"})
    assert res.status_code == 200
    return res.json()["access_token"]

@pytest.mark.asyncio
async def test_update_profile():
    token = get_reporter_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Update profile
    res = client.patch("/api/profile", json={"bio": "Testing bio update", "beat": "Testing beat update"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["bio"] == "Testing bio update"
    assert data["beat"] == "Testing beat update"

@pytest.mark.asyncio
async def test_edit_post():
    token = get_reporter_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a post first
    res = client.post("/api/posts", json={"title": "Original Title", "body": "Original Body", "kind": "dispatch"}, headers=headers)
    assert res.status_code == 200
    post_id = res.json()["id"]
    
    # Edit the post
    res = client.patch(f"/api/posts/{post_id}", json={"title": "Edited Title", "body": "Edited Body"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Edited Title"
    assert data["body"] == "Edited Body"
    assert data["edited_at"] is not None
