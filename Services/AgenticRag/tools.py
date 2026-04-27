from langchain.tools import tool
from langchain_openai import OpenAIEmbeddings
from Integrations.pinecone_client import index, supabase, pc
from typing import Optional
import asyncio
import os

embedding_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
    openai_api_key=os.getenv("OPENAI_API_KEY")
)


def _embed(query: str) -> list:
    return embedding_model.embed_query(query)


def _pinecone_search(
    embedding: list,
    workspace_name: str,
    top_k: int = 5,
    filter_dict: Optional[dict] = None
) -> list:
    results = index.query(
        vector=embedding,
        top_k=top_k,
        include_metadata=True,
        include_values=False,
        namespace=workspace_name,
        filter=filter_dict if filter_dict else None
    )
    return results.get("matches", [])


def _rerank(query: str, matches: list, top_n: int = 3) -> list:
    if not matches:
        return []
    documents = [m["metadata"].get("text", "") for m in matches]
    reranked = pc.inference.rerank(
        model="bge-reranker-v2-m3",
        query=query,
        documents=documents,
        top_n=top_n,
        return_documents=True
    )
    chunks = []
    for item in reranked.data:
        original = matches[item.index]
        meta = original.get("metadata", {})
        chunks.append({
            "text":          meta.get("text", ""),
            "score":         item.score,
            "document_id":   meta.get("document_id"),
            "page_number":   meta.get("page_number"),
            "section_title": meta.get("section_title"),
            "chunk_index":   meta.get("chunk_index"),
            "source":        f"Page {meta.get('page_number', 'N/A')} | "
                             f"Section: {meta.get('section_title', 'N/A')}"
        })
    return chunks


def _format_chunks(chunks: list) -> str:
    if not chunks:
        return "No relevant information found."
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i} | {chunk['source']}]\n{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 1 — Search Workspace
# ─────────────────────────────────────────────────────────────────────────────

def make_search_workspace_tool(workspace_name: str):
    @tool
    def search_workspace(query: str) -> str:
        """
        Search the workspace knowledge base for information relevant to the query.
        Use this as the first tool for any question.
        Input: natural language query string.
        """
        try:
            embedding = _embed(query)
            matches   = _pinecone_search(embedding, workspace_name, top_k=5)
            if not matches:
                return "No relevant information found in this workspace."
            chunks = _rerank(query, matches, top_n=3)
            return _format_chunks(chunks)
        except Exception as e:
            return f"Search failed: {str(e)}"

    return search_workspace


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 2 — Filter by Document
# ─────────────────────────────────────────────────────────────────────────────

def make_search_by_document_tool(workspace_name: str):
    @tool
    def search_by_document(input: str) -> str:
        """
        Search within a specific document in the workspace.
        Use when user mentions a specific file or document name.
        Input format: 'document_id|||query'
        Example: 'd71d47eb-08ca|||what are the admission requirements'
        """
        try:
            if "|||" not in input:
                return "Invalid input. Use format: 'document_id|||query'"

            doc_id, query = input.split("|||", 1)
            doc_id  = doc_id.strip()
            query   = query.strip()

            embedding   = _embed(query)
            filter_dict = {"document_id": {"$eq": doc_id}}
            matches     = _pinecone_search(
                embedding, workspace_name,
                top_k=5, filter_dict=filter_dict
            )

            if not matches:
                return f"No information found in document '{doc_id}'."

            chunks = _rerank(query, matches, top_n=3)
            return _format_chunks(chunks)

        except Exception as e:
            return f"Document search failed: {str(e)}"

    return search_by_document


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 3 — Get Document Summary
# ─────────────────────────────────────────────────────────────────────────────

def make_get_document_summary_tool(workspace_name: str):
    @tool
    def get_document_summary(document_id: str) -> str:
        """
        Get a summary of a specific document by fetching its first few chunks.
        Use when user asks 'what is this document about' or 'summarize document X'.
        Input: document_id string.
        """
        try:
            # Fetch first 5 chunks of the document ordered by chunk_index
            result = supabase.table("document_chunks") \
                .select("text, chunk_index, section_title") \
                .eq("document_id", document_id) \
                .order("chunk_index") \
                .limit(5) \
                .execute()

            if not result.data:
                # Fallback — search Pinecone with generic query
                embedding = _embed("summary introduction overview")
                filter_dict = {"document_id": {"$eq": document_id}}
                matches = _pinecone_search(
                    embedding, workspace_name,
                    top_k=5, filter_dict=filter_dict
                )
                if not matches:
                    return f"Document '{document_id}' not found."
                chunks = [m["metadata"].get("text", "") for m in matches]
                return "\n\n".join(chunks[:3])

            texts = [row["text"] for row in result.data]
            return "\n\n".join(texts)

        except Exception as e:
            return f"Summary retrieval failed: {str(e)}"

    return get_document_summary


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 4 — Multi Query (Rephrase + Retry)
# ─────────────────────────────────────────────────────────────────────────────

def make_multi_query_tool(workspace_name: str):
    @tool
    def multi_query_search(query: str) -> str:
        """
        Search using multiple rephrased versions of the query.
        Use when search_workspace returns no results or low quality results.
        Generates 3 query variations and merges the best results.
        Input: original query string.
        """
        try:
            # Generate query variations
            variations = [
                query,
                f"information about {query}",
                f"details regarding {query}",
            ]

            all_matches = []
            seen_ids    = set()

            for variation in variations:
                embedding = _embed(variation)
                matches   = _pinecone_search(
                    embedding, workspace_name, top_k=3
                )
                for match in matches:
                    match_id = match.get("id")
                    if match_id not in seen_ids:
                        seen_ids.add(match_id)
                        all_matches.append(match)

            if not all_matches:
                return "No relevant information found after multiple search attempts."

            # Rerank all collected matches together
            chunks = _rerank(query, all_matches, top_n=3)
            return _format_chunks(chunks)

        except Exception as e:
            return f"Multi-query search failed: {str(e)}"

    return multi_query_search


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 5 — List Workspace Documents
# ─────────────────────────────────────────────────────────────────────────────

def make_list_documents_tool(workspace_name: str):
    @tool
    def list_workspace_documents(input: str = "") -> str:
        """
        List all documents available in this workspace.
        Use when user asks 'what files do you have' or
        'what documents are available' or to find a document_id.
        Input: empty string or ignored.
        """
        try:
            result = supabase.table("DimUserDocuments") \
                .select("doc_id, file_name, file_extension, created_at") \
                .eq("workspace_name", workspace_name) \
                .execute()

            if not result.data:
                return "No documents found in this workspace."

            lines = ["Available documents in this workspace:\n"]
            for doc in result.data:
                lines.append(
                    f"• {doc['file_name']}.{doc['file_extension']} "
                    f"(ID: {doc['doc_id']})"
                )
            return "\n".join(lines)

        except Exception as e:
            return f"Failed to list documents: {str(e)}"

    return list_workspace_documents


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 6 — Search by Section
# ─────────────────────────────────────────────────────────────────────────────

def make_search_by_section_tool(workspace_name: str):
    @tool
    def search_by_section(input: str) -> str:
        """
        Search within a specific section title across all documents.
        Use when user asks about a specific section, chapter, or topic area.
        Input format: 'section_title|||query'
        Example: 'Graduate Programs|||admission requirements'
        """
        try:
            if "|||" not in input:
                return "Invalid input. Use format: 'section_title|||query'"

            section, query = input.split("|||", 1)
            section = section.strip()
            query   = query.strip()

            embedding   = _embed(query)
            filter_dict = {"section_title": {"$eq": section}}
            matches     = _pinecone_search(
                embedding, workspace_name,
                top_k=5, filter_dict=filter_dict
            )

            if not matches:
                return f"No information found in section '{section}'."

            chunks = _rerank(query, matches, top_n=3)
            return _format_chunks(chunks)

        except Exception as e:
            return f"Section search failed: {str(e)}"

    return search_by_section


# ─────────────────────────────────────────────────────────────────────────────
# TOOL FACTORY — Returns all tools bound to workspace
# ─────────────────────────────────────────────────────────────────────────────

def get_agent_tools(workspace_name: str) -> list:
    """Returns all tools initialized for a specific workspace."""
    return [
        make_search_workspace_tool(workspace_name),
        make_search_by_document_tool(workspace_name),
        make_get_document_summary_tool(workspace_name),
        make_multi_query_tool(workspace_name),
        make_list_documents_tool(workspace_name),
        make_search_by_section_tool(workspace_name),
    ]