from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends
import os
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from fastapi import Request, Depends, HTTPException
from typing import List

# Load Keys
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
SUPABASE_JWKS_URL = os.getenv("SUPABASE_JWKS_URL")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="normal_sign_in")
