from fastapi import HTTPException
import uuid
from Integrations.pinecone_client import index
from Integrations.openai_client import embedding_model
import asyncio

# --- Generate Embeddings and Save to Pinecone ---
async def embed_and_save_chunks(chunks):
    try:
        print("Embedding and saving chunks...")

        text=[chunks['text'] for chunks in chunks]

        embadding = embedding_model.embed_documents(text)

        vectors = []

        for i, chunk in enumerate(chunks):
            chunk_id = str(uuid.uuid4())

            # metadata = {
            #     "text": chunk["text"],  # 🔥 IMPORTANT for RAG retrieval later
            #     "document_id": chunk["document_id"],
            #     "page_number": chunk["page_number"],
            #     "section_title": chunk["section_title"],
            #     "chunk_index": chunk["chunk_index"],
            #     "workspace_name": chunk["workspace_name"]  # SaaS isolation
            # }

            metadata = {
                "text": chunk["text"],
                "document_id": chunk["document_id"],
                "chunk_index": chunk["chunk_index"],
            }

            vectors.append({
                'id':chunk_id,
                'values':embadding[i],
                'metadata':metadata
            })
            # Upsert into Pinecone
            index.upsert(
                vectors=vectors,
                namespace=chunk["workspace_name"] 
            )

            print(f"Upserted chunk ID: {chunk_id} into namespace {chunk['workspace_name']}")

    except Exception as e:
        print(f"Error in embed_and_save_chunks: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to embed and save chunks: {str(e)}"
        )

from Services.embedding_cache import get_cached_embedding, set_cached_embedding

async def get_query_embedding(query: str) -> list:
    """
    Get embedding for query.
    Checks Redis cache first — falls back to OpenAI if miss.
    """
    # ── Try cache first ───────────────────────────────────────────────────────
    cached = await get_cached_embedding(query)
    if cached:
        print(f"Embedding cache HIT ✅")
        return cached

    # ── Cache miss — call OpenAI ──────────────────────────────────────────────
    print(f"Embedding cache MISS — calling OpenAI")
    loop      = asyncio.get_event_loop()
    embedding = await loop.run_in_executor(
        None, embedding_model.embed_query, query
    )

    # ── Store in cache for next time ──────────────────────────────────────────
    await set_cached_embedding(query, embedding)

    return embedding