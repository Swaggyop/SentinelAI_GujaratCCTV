import httpx
import asyncio
from typing import Dict, Any, Optional
import logging
from src.config import BACKEND_API_URL

logger = logging.getLogger(__name__)


class BackendClient:
    """Persistent async HTTP client for posting detections and heartbeats to the backend API.
    Uses a single httpx.AsyncClient instance for connection pooling."""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._auth_token: Optional[str] = None
        self._refreshing: bool = False
        self._email: Optional[str] = None
        self._password: Optional[str] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=BACKEND_API_URL,
                timeout=httpx.Timeout(10.0, connect=5.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._client

    def set_auth_token(self, token: str):
        """Set JWT token for authenticated requests to the backend."""
        self._auth_token = token

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        return headers

    async def post_detection(self, payload: Dict[str, Any]) -> bool:
        """Post a detection to the backend with retry + exponential backoff.
        Auto-refreshes JWT on 401. Returns True if successful, False if all retries exhausted."""
        retries = 3
        delay = 1

        client = await self._get_client()
        for attempt in range(retries):
            try:
                response = await client.post(
                    "/api/v1/detections",
                    json=payload,
                    headers=self._headers(),
                )
                response.raise_for_status()
                data = response.json()
                if data.get("matched"):
                    logger.info(
                        f"ALERT: plate {payload.get('plate_text_normalized')} matched watchlist "
                        f"(camera={payload.get('camera_id')}, alert_id={data.get('alert_id')})"
                    )
                return True
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401 and not self._refreshing:
                    # JWT expired — re-login automatically
                    logger.warning("JWT expired, re-authenticating with backend...")
                    await self._auto_relogin()
                    continue  # retry with fresh token
                if e.response.status_code == 400:
                    # Client error (bad camera_id, validation) — don't retry
                    logger.error(f"Detection rejected (400): {e.response.text}")
                    return False
                logger.error(f"Detection POST failed (attempt {attempt + 1}/{retries}): {e}")
            except Exception as e:
                logger.error(f"Detection POST error (attempt {attempt + 1}/{retries}): {e}")

            if attempt < retries - 1:
                await asyncio.sleep(delay)
                delay *= 2

        logger.error(f"Detection POST failed after {retries} attempts: {payload.get('idempotency_key')}")
        return False

    async def post_heartbeat(self, payload: Dict[str, Any]) -> None:
        """Fire-and-forget heartbeat. Don't block detection pipeline on failures."""
        try:
            client = await self._get_client()
            await client.post(
                "/api/v1/heartbeats",
                json=payload,
                headers=self._headers(),
                timeout=2.0,
            )
        except Exception as e:
            logger.warning(f"Heartbeat failed for {payload.get('camera_id')}: {e}")

    async def login(self, email: str, password: str) -> Optional[str]:
        """Authenticate with the backend and store the access token."""
        self._email = email
        self._password = password
        try:
            client = await self._get_client()
            response = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            response.raise_for_status()
            data = response.json()
            self._auth_token = data.get("accessToken")
            logger.info(f"Authenticated with backend as {email}")
            return self._auth_token
        except Exception as e:
            logger.error(f"Backend login failed: {e}")
            return None

    async def _auto_relogin(self):
        """Re-authenticate using stored credentials when JWT expires."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            if self._email and self._password:
                token = await self.login(self._email, self._password)
                if token:
                    logger.info("Successfully re-authenticated after JWT expiry.")
                else:
                    logger.error("Failed to re-authenticate after JWT expiry.")
            else:
                logger.error("Cannot re-authenticate: no stored credentials.")
        finally:
            self._refreshing = False

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# Module-level singleton
_backend_client = BackendClient()


async def post_detection(payload: Dict[str, Any]) -> bool:
    return await _backend_client.post_detection(payload)


async def post_heartbeat(payload: Dict[str, Any]) -> None:
    await _backend_client.post_heartbeat(payload)


def get_client() -> BackendClient:
    return _backend_client
