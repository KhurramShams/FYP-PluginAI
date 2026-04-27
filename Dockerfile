FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# ✅ Step 1: Install CPU-only PyTorch first
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# ✅ Step 2: Install ALL other packages (including nltk)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# ✅ Step 3: Download NLTK data AFTER nltk is installed
RUN python -m nltk.downloader punkt punkt_tab

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
