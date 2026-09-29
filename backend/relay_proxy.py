"""
Azadi Relay Proxy — Stateless, zero-log request forwarder.
Strips all identifying headers before forwarding to the real backend.
Deploy on a SEPARATE server from the main backend.
"""
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import httpx
import os

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fallback to local if not provided, assuming local dev runs proxy and server on different ports
BACKEND_URL = os.environ.get("AZADI_BACKEND_URL", "http://127.0.0.1:8000")

# Headers to STRIP (never forward to backend)
STRIP_HEADERS = {
    "x-forwarded-for", "x-real-ip", "x-client-ip", "cf-connecting-ip",
    "true-client-ip", "x-forwarded-host", "x-forwarded-proto",
    "user-agent", "referer", "origin", "x-request-id",
}

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    # Build clean headers (strip all identifying info)
    clean_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in STRIP_HEADERS and k.lower() != "host"
    }
    clean_headers["User-Agent"] = "Azadi-Relay/1.0"  # Generic, non-identifying

    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=f"{BACKEND_URL}/{path}",
            headers=clean_headers,
            content=body,
            params=dict(request.query_params),
        )

    return StreamingResponse(
        iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )

if __name__ == "__main__":
    import uvicorn
    # Run the proxy on port 8001
    uvicorn.run(app, host="0.0.0.0", port=8001)
