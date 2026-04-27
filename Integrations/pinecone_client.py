from fastapi import HTTPException
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Supabase Client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET")
SUPABASE_STORAGE_URL = os.getenv("SUPABASE_STORAGE_URL")
SUPABASE_ACCESS_KEY = os.getenv("SUPABASE_ACCESS_KEY")

# -------------Supabase Client-----------
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Error connecting to Supabase: {e}")

#----------------Pinecone Setup----------

from pinecone import Pinecone, ServerlessSpec

load_dotenv()
PINECONE_KEY = os.getenv("PINECONE_API_KEY")

pc = Pinecone(api_key=PINECONE_KEY)
INDEX_NAME = "pluginai-index"

# Create index if not exists
if INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(
        name=INDEX_NAME,
        dimension=1536,
        metric="cosine",
        spec=ServerlessSpec(
        cloud="aws",
        region="aws-ap-southeast-1"
        )
    )

index = pc.Index(INDEX_NAME)
