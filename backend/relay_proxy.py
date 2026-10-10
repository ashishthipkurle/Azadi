"""
Azadi Relay Proxy — Stateless, zero-log request forwarder.
Strips all identifying headers before forwarding to the real backend.
Deploy on a SEPARATE server from the main backend, preferably on a
neutral-looking domain (e.g., "cdn-api-services.com") so ISPs cannot
identify that users are connecting to a news platform.

Setup:
  pip install fastapi uvicorn httpx
  AZADI_BACKEND_URL=https://azadi-production-eb77.up.railway.app uvicorn relay_proxy:app --host 0.0.0.0 --port 8001

Then set EXPO_PUBLIC_RELAY_URL in your frontend .env to this relay's public URL.
"""
from fastapi import FastAPI, Request
from fastapi.responses import Response
import httpx
import os
import logging

from fastapi.middleware.cors import CORSMiddleware

# Intentionally generic name — reveals nothing about the actual service
app = FastAPI(
    title="CDN Services API",
    docs_url=None,       # Hide docs in production
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Disable request logging to ensure zero-log policy
logging.getLogger("uvicorn.access").disabled = True

BACKEND_URL = os.environ.get("AZADI_BACKEND_URL", "https://azadi-production-eb77.up.railway.app")

# Headers to STRIP (never forward to backend — protects user identity)
STRIP_HEADERS = {
    "x-forwarded-for", "x-real-ip", "x-client-ip", "cf-connecting-ip",
    "true-client-ip", "x-forwarded-host", "x-forwarded-proto",
    "user-agent", "referer", "origin", "x-request-id",
    "x-forwarded-server", "via", "forwarded",
}

# Headers to strip from backend responses (prevent backend identity leak)
STRIP_RESPONSE_HEADERS = {
    "server", "x-powered-by", "x-request-id", "via",
    "transfer-encoding", "content-encoding", "content-length",
}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request):
    """Transparent zero-log reverse proxy."""
    # Build clean headers (strip all identifying info)
    clean_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in STRIP_HEADERS and k.lower() != "host"
    }
    clean_headers["User-Agent"] = "CDN-Services/1.0"  # Generic, non-identifying

    body = await request.body()

    target_url = f"{BACKEND_URL}/{path}"
    if request.query_params:
        target_url += f"?{request.query_params}"

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=clean_headers,
                content=body,
            )

        # Clean response headers
        response_headers = {
            k: v for k, v in resp.headers.items()
            if k.lower() not in STRIP_RESPONSE_HEADERS
        }

        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=response_headers,
        )
    except httpx.TimeoutException:
        return Response(content='{"detail":"Gateway timeout"}', status_code=504, media_type="application/json")
    except httpx.ConnectError:
        return Response(content='{"detail":"Service unavailable"}', status_code=502, media_type="application/json")
    except Exception:
        return Response(content='{"detail":"Service error"}', status_code=502, media_type="application/json")


@app.get("/")
async def root():
    """Generic health check that reveals nothing about the actual service."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
