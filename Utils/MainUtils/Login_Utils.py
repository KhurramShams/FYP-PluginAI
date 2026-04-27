import os
from fastapi import HTTPException
from fastapi.responses import RedirectResponse
import requests
from urllib.parse import urlencode
from dotenv import load_dotenv

# Load Keys
load_dotenv()

# Load environment variables
OIDC_GOOGLE_CLIENT_ID = os.getenv("OIDC_GOOGLE_CLIENT_ID")
OIDC_GOOGLE_CLIENT_SECRET = os.getenv("OIDC_GOOGLE_CLIENT_SECRET")
OIDC_GOOGLE_REDIRECT_URI = os.getenv("OIDC_GOOGLE_REDIRECT_URI")

# Check if environment variables are set
if not OIDC_GOOGLE_CLIENT_ID or not OIDC_GOOGLE_CLIENT_SECRET or not OIDC_GOOGLE_REDIRECT_URI:
    raise EnvironmentError("Google OAuth credentials are not set in the environment variables.")

def get_google_oauth_url():
    # Prepare OAuth parameters
    params = {
        "response_type": "code",
        "client_id": OIDC_GOOGLE_CLIENT_ID,
        "redirect_uri": OIDC_GOOGLE_REDIRECT_URI,
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",  # Prompt for consent, ask for refresh token
    }

    # Create the Google OAuth URL using urlencode
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    request_url = f"{base_url}?{urlencode(params)}"
    return request_url


def get_user_info_from_google(code: str):
    # Exchange the authorization code for an access token
    token_response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": OIDC_GOOGLE_CLIENT_ID,
            "client_secret": OIDC_GOOGLE_CLIENT_SECRET,
            "redirect_uri": OIDC_GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # Check if the token exchange was successful
    if not token_response.ok:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code for token.")

    token_json = token_response.json()
    access_token = token_json.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="Access token not received.")

    # Fetch user information using the access token
    user_info_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    # Check if user info request was successful
    if not user_info_response.ok:
        raise HTTPException(status_code=400, detail="Failed to fetch user information from Google.")

    # Return user information
    return user_info_response.json()
