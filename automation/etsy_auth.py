# -*- coding: utf-8 -*-
"""
Groundwork - Etsy API v3 OAuth 2.0 Integration
================================================
Uses PKCE (Proof Key for Code Exchange) as required by Etsy v3.

Environment variables required:
  ETSY_API_KEY        — your Etsy app's API key (keystring)
  ETSY_SHARED_SECRET  — your Etsy app's shared secret

Populated automatically after first auth:
  ETSY_ACCESS_TOKEN   — OAuth bearer token (expires in 3600s)
  ETSY_REFRESH_TOKEN  — used to get new access tokens (single-use on Etsy)
  ETSY_TOKEN_EXPIRY   — unix timestamp when current token expires
  ETSY_SHOP_ID        — cached after first successful API call

SETUP — run: python etsy_auth.py setup
"""

import os
import sys
import json
import time
import base64
import hashlib
import secrets
import subprocess
import threading
import webbrowser
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler

import requests

# ── Constants ─────────────────────────────────────────────────────────────
ETSY_AUTH_URL  = "https://www.etsy.com/oauth/connect"
ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
ETSY_API_BASE  = "https://openapi.etsy.com/v3"
REDIRECT_URI   = "http://localhost:8080/callback"

SCOPES = [
    "listings_r", "listings_w", "listings_d",
    "shops_r",
    "profile_r",
    "transactions_r",
]

# Local file for token persistence (supplements env vars)
TOKEN_FILE = Path(__file__).parent / ".etsy_tokens.json"
PKCE_FILE  = Path(__file__).parent / ".pkce_state.json"

# ── Windows env var helpers ────────────────────────────────────────────────
def _set_env(name: str, value: str):
    """Set a Windows environment variable permanently (setx) and for this process."""
    os.environ[name] = value
    try:
        subprocess.run(["setx", name, value], capture_output=True, check=True)
    except Exception:
        pass  # setx unavailable or failed — in-process value still set


def _load_tokens_from_file():
    """Load tokens from the local JSON file into os.environ if not already set."""
    if not TOKEN_FILE.exists():
        return
    try:
        data = json.loads(TOKEN_FILE.read_text())
        for key in ("ETSY_ACCESS_TOKEN", "ETSY_REFRESH_TOKEN", "ETSY_TOKEN_EXPIRY", "ETSY_SHOP_ID"):
            if key in data and not os.environ.get(key):
                os.environ[key] = str(data[key])
    except Exception:
        pass


def _save_tokens_to_file(**kwargs):
    """Persist token data to JSON file and env vars."""
    existing = {}
    if TOKEN_FILE.exists():
        try:
            existing = json.loads(TOKEN_FILE.read_text())
        except Exception:
            pass
    existing.update(kwargs)
    TOKEN_FILE.write_text(json.dumps(existing, indent=2))
    for key, value in kwargs.items():
        _set_env(key, str(value))


# Load persisted tokens on import
_load_tokens_from_file()

# ── PKCE helpers ───────────────────────────────────────────────────────────
def _generate_pkce_pair():
    """Generate a PKCE code_verifier and S256 code_challenge."""
    verifier  = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


# ── OAuth flow ─────────────────────────────────────────────────────────────
def get_authorization_url() -> tuple[str, str]:
    """
    Build the Etsy authorization URL.

    Returns (url, state) — open the URL in a browser.
    The state and PKCE verifier are saved to .pkce_state.json for use
    in exchange_code_for_token().
    """
    api_key = os.environ.get("ETSY_API_KEY")
    if not api_key:
        raise EnvironmentError("ETSY_API_KEY is not set. Run: python etsy_auth.py setup")

    verifier, challenge = _generate_pkce_pair()
    state = secrets.token_urlsafe(16)

    PKCE_FILE.write_text(json.dumps({"verifier": verifier, "state": state}))

    params = {
        "response_type":         "code",
        "redirect_uri":          REDIRECT_URI,
        "scope":                 " ".join(SCOPES),
        "client_id":             api_key,
        "state":                 state,
        "code_challenge":        challenge,
        "code_challenge_method": "S256",
    }
    url = ETSY_AUTH_URL + "?" + urlencode(params)
    return url, state


def exchange_code_for_token(code: str, state: str | None = None) -> dict:
    """
    Exchange an authorization code for access + refresh tokens.
    Saves tokens to env vars and .etsy_tokens.json.
    """
    api_key = os.environ.get("ETSY_API_KEY")
    if not api_key:
        raise EnvironmentError("ETSY_API_KEY is not set.")

    if not PKCE_FILE.exists():
        raise FileNotFoundError(".pkce_state.json not found. Call get_authorization_url() first.")

    pkce = json.loads(PKCE_FILE.read_text())

    if state and state != pkce.get("state"):
        raise ValueError("OAuth state mismatch — possible CSRF. Restart the auth flow.")

    resp = requests.post(ETSY_TOKEN_URL, data={
        "grant_type":    "authorization_code",
        "client_id":     api_key,
        "redirect_uri":  REDIRECT_URI,
        "code":          code,
        "code_verifier": pkce["verifier"],
    })
    resp.raise_for_status()
    tokens = resp.json()

    expiry = str(time.time() + tokens.get("expires_in", 3600))
    _save_tokens_to_file(
        ETSY_ACCESS_TOKEN  = tokens["access_token"],
        ETSY_REFRESH_TOKEN = tokens["refresh_token"],
        ETSY_TOKEN_EXPIRY  = expiry,
    )
    PKCE_FILE.unlink(missing_ok=True)
    print("✅ Tokens saved successfully.")
    return tokens


def refresh_access_token() -> dict:
    """
    Refresh the access token using the stored refresh token.
    Etsy issues a new refresh token on each refresh — it is single-use.
    """
    api_key       = os.environ.get("ETSY_API_KEY")
    refresh_token = os.environ.get("ETSY_REFRESH_TOKEN")

    if not refresh_token:
        raise EnvironmentError("ETSY_REFRESH_TOKEN not set. Complete OAuth flow first.")

    resp = requests.post(ETSY_TOKEN_URL, data={
        "grant_type":    "refresh_token",
        "client_id":     api_key,
        "refresh_token": refresh_token,
    })
    resp.raise_for_status()
    tokens = resp.json()

    expiry = str(time.time() + tokens.get("expires_in", 3600))
    update = {
        "ETSY_ACCESS_TOKEN": tokens["access_token"],
        "ETSY_TOKEN_EXPIRY": expiry,
    }
    if "refresh_token" in tokens:
        update["ETSY_REFRESH_TOKEN"] = tokens["refresh_token"]
    _save_tokens_to_file(**update)
    print("✅ Access token refreshed.")
    return tokens


def _get_valid_token() -> str:
    """Return a valid access token, auto-refreshing if within 60s of expiry."""
    try:
        expiry = float(os.environ.get("ETSY_TOKEN_EXPIRY", "0"))
    except ValueError:
        expiry = 0.0

    if time.time() >= expiry - 60:
        refresh_access_token()

    token = os.environ.get("ETSY_ACCESS_TOKEN")
    if not token:
        raise EnvironmentError("No access token. Run: python etsy_auth.py auth")
    return token


# ── Authenticated request helper ──────────────────────────────────────────
def _api(method: str, endpoint: str, retry_on_401: bool = True, **kwargs) -> dict | list:
    """Make an authenticated Etsy API call."""
    token   = _get_valid_token()
    api_key = os.environ.get("ETSY_API_KEY", "")

    headers = {
        "x-api-key":     api_key,
        "Authorization": f"Bearer {token}",
    }
    if "headers" in kwargs:
        headers.update(kwargs.pop("headers"))

    # Don't set Content-Type when uploading files — requests sets it automatically
    if "json" in kwargs:
        headers["Content-Type"] = "application/json"

    resp = requests.request(method, f"{ETSY_API_BASE}{endpoint}", headers=headers, **kwargs)

    if resp.status_code == 401 and retry_on_401:
        refresh_access_token()
        return _api(method, endpoint, retry_on_401=False, **kwargs)

    resp.raise_for_status()
    return resp.json() if resp.content else {}


# ── Shop helpers ───────────────────────────────────────────────────────────
def _get_shop_id() -> int:
    """Return shop_id, fetching and caching it if needed."""
    cached = os.environ.get("ETSY_SHOP_ID")
    if cached:
        return int(cached)

    me    = _api("GET", "/application/users/me")
    shops = _api("GET", f"/application/users/{me['user_id']}/shops")
    shop_id = shops["shop_id"]
    _save_tokens_to_file(ETSY_SHOP_ID=str(shop_id))
    return shop_id


# ── Public functions ───────────────────────────────────────────────────────
def test_connection() -> bool:
    """Verify the Etsy connection and print shop details."""
    try:
        shop_id = _get_shop_id()
        shop    = _api("GET", f"/application/shops/{shop_id}")
        print(f"✅ Connected to Etsy")
        print(f"   Shop name : {shop['shop_name']}")
        print(f"   Shop ID   : {shop_id}")
        print(f"   Listings  : {shop.get('listing_active_count', '?')} active")
        print(f"   URL       : https://www.etsy.com/shop/{shop['shop_name']}")
        return True
    except Exception as exc:
        print(f"❌ Connection failed: {exc}")
        return False


def create_listing(listing_data: dict) -> int:
    """
    Create a draft Etsy digital listing.

    listing_data fields:
      title       (str, required)   — under 140 chars
      description (str, required)   — full Etsy description
      price       (float, required) — e.g. 27.00
      tags        (list, required)  — up to 13 strings
      taxonomy_id (int, optional)   — default 2078 (Templates & Fonts)
      quantity    (int, optional)   — default 999
    """
    shop_id = _get_shop_id()

    payload = {
        "quantity":          listing_data.get("quantity", 999),
        "title":             listing_data["title"],
        "description":       listing_data["description"],
        "price":             float(listing_data["price"]),
        "who_made":          "i_did",
        "when_made":         "made_to_order",
        "taxonomy_id":       listing_data.get("taxonomy_id", 2078),
        "type":              "download",
        "is_digital":        True,
        "should_auto_renew": True,
        "state":             "draft",
        "tags":              listing_data.get("tags", [])[:13],
    }

    result     = _api("POST", f"/application/shops/{shop_id}/listings", json=payload)
    listing_id = result["listing_id"]
    print(f"✅ Draft listing created: {listing_id}")
    print(f"   Title: {listing_data['title'][:60]}...")
    return listing_id


def upload_listing_image(listing_id: int, image_path: str) -> dict:
    """
    Upload a product photo to an Etsy listing.
    image_path — absolute path to a PNG or JPG file.
    """
    shop_id    = _get_shop_id()
    token      = _get_valid_token()
    api_key    = os.environ.get("ETSY_API_KEY", "")
    image_path = Path(image_path)

    with open(image_path, "rb") as fh:
        resp = requests.post(
            f"{ETSY_API_BASE}/application/shops/{shop_id}/listings/{listing_id}/images",
            headers={"x-api-key": api_key, "Authorization": f"Bearer {token}"},
            files={"image": (image_path.name, fh, "image/png")},
        )

    if resp.status_code == 401:
        refresh_access_token()
        return upload_listing_image(listing_id, str(image_path))

    resp.raise_for_status()
    result = resp.json()
    print(f"✅ Image uploaded: {image_path.name} → image_id {result['listing_image_id']}")
    return result


def upload_digital_file(listing_id: int, file_path: str) -> dict:
    """
    Attach the downloadable file to an Etsy digital listing.
    file_path — absolute path to the Excel/PDF/ZIP file.
    """
    shop_id   = _get_shop_id()
    token     = _get_valid_token()
    api_key   = os.environ.get("ETSY_API_KEY", "")
    file_path = Path(file_path)

    with open(file_path, "rb") as fh:
        resp = requests.post(
            f"{ETSY_API_BASE}/application/shops/{shop_id}/listings/{listing_id}/files",
            headers={"x-api-key": api_key, "Authorization": f"Bearer {token}"},
            files={"file": (file_path.name, fh, "application/octet-stream")},
            data={"name": file_path.name, "rank": 1},
        )

    if resp.status_code == 401:
        refresh_access_token()
        return upload_digital_file(listing_id, str(file_path))

    resp.raise_for_status()
    result = resp.json()
    print(f"✅ Digital file uploaded: {file_path.name} → file_id {result['listing_file_id']}")
    return result


def publish_listing(listing_id: int) -> dict:
    """Change a draft listing to active (live on Etsy)."""
    shop_id = _get_shop_id()
    result  = _api("PATCH", f"/application/shops/{shop_id}/listings/{listing_id}",
                   json={"state": "active"})
    print(f"✅ Listing {listing_id} is now LIVE on Etsy.")
    return result


# ── Interactive OAuth flow (local callback server) ─────────────────────────
_callback_result: dict = {}


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        _callback_result["code"]  = params.get("code",  [None])[0]
        _callback_result["state"] = params.get("state", [None])[0]
        _callback_result["error"] = params.get("error", [None])[0]

        body = b"""
        <html><head><style>
        body{font-family:sans-serif;background:#0d1117;color:#F5F0E8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .box{text-align:center;padding:40px;background:#1A1E2A;border-radius:12px;border:2px solid #C8960A}
        h1{color:#C8960A}
        </style></head><body>
        <div class='box'><h1>Groundwork &#10003;</h1>
        <p>Etsy authorization complete.</p><p>You can close this window.</p></div>
        </body></html>"""
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # silence request logs


def run_oauth_flow() -> dict:
    """
    Full interactive OAuth flow:
    1. Starts a local callback server on port 8080
    2. Opens the browser to Etsy's authorization page
    3. Waits for the callback (2-minute timeout)
    4. Exchanges the code for tokens and saves them
    """
    url, state = get_authorization_url()

    server = HTTPServer(("localhost", 8080), _CallbackHandler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()

    print("\nOpening Etsy authorization page in your browser...")
    print(f"If the browser doesn't open, visit:\n  {url}\n")
    webbrowser.open(url)

    thread.join(timeout=120)

    if _callback_result.get("error"):
        raise PermissionError(f"Authorization denied: {_callback_result['error']}")
    if not _callback_result.get("code"):
        raise TimeoutError("Authorization timed out. Run again and approve within 2 minutes.")

    tokens = exchange_code_for_token(_callback_result["code"], _callback_result.get("state"))
    server.server_close()
    return tokens


# ── CLI entry point ────────────────────────────────────────────────────────
SETUP_INSTRUCTIONS = """
╔══════════════════════════════════════════════════════════════════╗
║          GROUNDWORK — Etsy API Setup Instructions               ║
╚══════════════════════════════════════════════════════════════════╝

STEP 1 — Register your Etsy Developer App
─────────────────────────────────────────
1. Go to: https://www.etsy.com/developers/register
2. Log in with your Etsy seller account
3. Click "Create a New App"
4. Fill in:
   - App Name:        Groundwork HQ
   - App Description: Internal automation for Groundwork construction templates
   - Callback URL:    http://localhost:8080/callback
5. Accept the terms and click "Register Application"
6. On the next screen you will see:
   - KEYSTRING  → this is your API Key
   - SECRET     → this is your Shared Secret
   Copy both values.

STEP 2 — Set Windows Environment Variables
──────────────────────────────────────────
Open Command Prompt or PowerShell as Administrator and run:

  setx ETSY_API_KEY "your-keystring-here"
  setx ETSY_SHARED_SECRET "your-secret-here"

Then CLOSE and reopen your terminal for the variables to take effect.

STEP 3 — Authorize Your Shop
─────────────────────────────
In a NEW terminal (after Step 2), run:

  python automation\\etsy_auth.py auth

This will:
  - Open your browser to Etsy's authorization page
  - Ask you to click "Allow Access"
  - Automatically capture the callback and save your tokens
  - Print your shop info to confirm it worked

STEP 4 — Test the Connection
─────────────────────────────
  python automation\\etsy_auth.py test

You should see your shop name and active listing count.

NOTES
─────
• Tokens are stored in automation\\.etsy_tokens.json
  (automatically loaded on each run — you won't need to re-auth unless
   you revoke access on Etsy)
• Access tokens expire after 3600 seconds but auto-refresh transparently
• Refresh tokens are single-use on Etsy — a new one is issued each time

TROUBLESHOOTING
───────────────
• "invalid_client" error → double-check ETSY_API_KEY is the keystring,
   not the secret
• "redirect_uri_mismatch" → confirm the callback URL in your Etsy app
   settings is exactly: http://localhost:8080/callback
• Port 8080 in use → close whatever is on 8080 and retry
• Token errors after a long time → run: python etsy_auth.py auth  (re-auth)
"""


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "setup":
        print(SETUP_INSTRUCTIONS)

    elif cmd == "auth":
        print("Starting Etsy OAuth 2.0 authorization flow...")
        tokens = run_oauth_flow()
        print("\nAuthorization complete. Testing connection...")
        test_connection()

    elif cmd == "test":
        test_connection()

    elif cmd == "refresh":
        refresh_access_token()
        print("Token refreshed.")

    elif cmd == "token":
        print("Current access token:", os.environ.get("ETSY_ACCESS_TOKEN", "(not set)"))
        expiry = float(os.environ.get("ETSY_TOKEN_EXPIRY", "0") or 0)
        remaining = expiry - time.time()
        if remaining > 0:
            print(f"Expires in: {int(remaining)}s ({int(remaining//60)}m)")
        else:
            print("Token expired — run: python etsy_auth.py refresh")

    else:
        print(__doc__)
        print("Commands:")
        print("  python etsy_auth.py setup    — show full setup instructions")
        print("  python etsy_auth.py auth     — run the OAuth flow and authorize")
        print("  python etsy_auth.py test     — verify connection and print shop info")
        print("  python etsy_auth.py refresh  — manually refresh the access token")
        print("  python etsy_auth.py token    — show current token expiry")
