# test_smtp.py
import smtplib
import os
from dotenv import load_dotenv

load_dotenv(override=True)

SMTP_HOST     = os.getenv("SMTP_HOST")
SMTP_PORT     = int(os.getenv("SMTP_PORT"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASS")

print(f"Connecting to {SMTP_HOST}:{SMTP_PORT}...")

try:
    # ✅ Port 465 = SMTP_SSL (not SMTP + starttls)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        print("Connected successfully")
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        print(f"Login successful as {SMTP_USERNAME}")
        print("✅ SMTP connection working!")

except smtplib.SMTPAuthenticationError:
    print("❌ Authentication failed — check username/password")
except smtplib.SMTPConnectError:
    print("❌ Connection failed — check host/port")
except Exception as e:
    print(f"❌ Error: {str(e)}")