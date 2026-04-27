# test_send_email.py
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv(override=True)

SMTP_HOST     = os.getenv("SMTP_HOST")
SMTP_PORT     = int(os.getenv("SMTP_PORT"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASS")        # ← make sure it's SMTP_PASS not SMTP_PASSWORD
SMTP_FROM     = os.getenv("SMTP_FROM_EMAIL")

TO_EMAIL = "shamsshaikh.iba@gmail.com"    # ← put your real email here to test

print(f"Host:     {SMTP_HOST}")
print(f"Port:     {SMTP_PORT}")
print(f"Username: {SMTP_USERNAME}")
print(f"From:     {SMTP_FROM}")
print(f"To:       {TO_EMAIL}")

msg = MIMEMultipart("alternative")
msg["Subject"] = "Test Email from Plugin AI"
msg["From"]    = f"Plugin AI <{SMTP_FROM}>"
msg["To"]      = TO_EMAIL
msg.attach(MIMEText("<h1>Test email working!</h1>", "html"))

try:
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, TO_EMAIL, msg.as_string())
        print("✅ Email sent successfully! Check your inbox.")
except Exception as e:
    print(f"❌ Failed: {str(e)}")