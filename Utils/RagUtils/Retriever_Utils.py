from fastapi import HTTPException
import uuid
from Integrations.openai_client import client, EMBEDDING_MODEL
from Integrations.pinecone_client import index

async def retrieve_context(workspace_id: str, query: str, top_k: int = 8):
    try: 
        response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=query
            )
        
        query_embedding = response.data[0].embedding

        # 2️⃣ Query Pinecone
        results = index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter={"workspace_id": workspace_id}  # workspace isolation
        )

        # 3️⃣ Extract chunks
        chunks = []
        for match in results["matches"]:
            chunks.append({
                "text": match["metadata"]["chunk_text"],
                "document_id": match["metadata"]["document_id"],
                "page": match["metadata"].get("page_number"),
                "source": match["metadata"].get("source")
            })

        return chunks

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Context retrieval failed: {str(e)}"
        ) 
