# Dockerfile
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (layer caching)
COPY requirements.txt .

# ✅ Step 1: Install CPU-only PyTorch FIRST (before other packages)
# This prevents pip from pulling full CUDA torch later
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# ✅ Step 2: Install remaining packages
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# ✅ Step 3: Download NLTK data
RUN python -m nltk.downloader punkt punkt_tab && \
    python -c "import nltk; print('NLTK data:', nltk.data.path)"

# Copy project files
COPY . .

# Expose port
EXPOSE 8000

# Start command -
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port $PORT"
