from fastapi import BackgroundTasks, HTTPException, Depends
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client, Client
from fastapi import APIRouter
import os
from supabase import create_client, Client

# Initialize Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

router = APIRouter()

# Function to send a welcome email (background task)
def send_welcome_email(email: str):
    # Set up the SMTP server and email details (example using Gmail)
    sender_email = "youremail@gmail.com"
    sender_password = "yourpassword"  # For Gmail, use app password or OAuth
    subject = "Welcome to Our Platform!"
    body = "Thank you for registering. We're excited to have you with us."

    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        # Connect to the Gmail SMTP server and send the email
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, email, msg.as_string())
        print("Welcome email sent successfully.")
    except Exception as e:
        print(f"Error sending email: {str(e)}")