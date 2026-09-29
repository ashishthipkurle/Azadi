import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_search_endpoint():
    response = client.get("/search?q=test")
    assert response.status_code == 200
    data = response.json()
    assert "posts" in data
    assert "reporters" in data

def test_get_notifications():
    # Attempting to get notifications without auth header
    response = client.get("/notifications")
    assert response.status_code == 401

def test_get_comments_no_auth():
    # Assuming some post_id exists or doesn't matter for 401/200 empty
    response = client.get("/posts/some-fake-id/comments")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_push_tokens_no_auth():
    response = client.post("/push-tokens", json={"token": "test-token", "platform": "web"})
    assert response.status_code == 401
