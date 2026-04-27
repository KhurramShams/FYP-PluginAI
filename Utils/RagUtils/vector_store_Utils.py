from Integrations.pinecone_client import index
from fastapi import HTTPException
import asyncio
from Integrations.pinecone_client import supabase

def _is_pinecone_not_found(e: Exception) -> bool:
    """Check if exception is a Pinecone 404 namespace not found error."""
    msg = str(e).lower()
    return "namespace not found" in msg or \
           "not found" in msg and "404" in str(e)

async def delete_file_vector_from_pinecone(
    doc_id: str,
    workspace_name: str) -> bool:
    """
    Delete a single document's vectors from Pinecone.
    Returns True if deleted or didn't exist, False on real error.
    """
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: index.delete(
                filter={"document_id": {"$eq": doc_id}},
                namespace=workspace_name
            )
        )
        print(f"Deleted vectors for doc_id: {doc_id} from namespace: {workspace_name}")
        return True

    except Exception as e:
        if _is_pinecone_not_found(e):
            # ✅ Namespace or vectors don't exist — nothing to delete
            print(f"Namespace '{workspace_name}' not found in Pinecone — skipping.")
            return True
        print(f"Error deleting doc vectors: {str(e)}")
        return False

async def delete_workspace_from_pinecone(workspace_name: str) -> bool:
    """
    Delete entire workspace namespace from Pinecone.
    Returns True if deleted or didn't exist, False on real error.
    """
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: index.delete(
                delete_all=True,
                namespace=workspace_name
            )
        )
        print(f"Deleted Pinecone namespace: {workspace_name}")
        return True

    except Exception as e:
        if _is_pinecone_not_found(e):
            # ✅ Namespace doesn't exist — nothing to delete
            print(f"Namespace '{workspace_name}' not found in Pinecone — skipping.")
            return True
        print(f"Error deleting workspace namespace: {str(e)}")
        return False

async def delete_document_from_pinecone(
    doc_id: str,
    workspace_name: str) -> bool:

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: index.delete(
                filter={"document_id": {"$eq": doc_id}},
                namespace=workspace_name
            )
        )
        print(f"Deleted document vectors — doc_id: {doc_id}, namespace: {workspace_name}")
        return True

    except Exception as e:
        if _is_pinecone_not_found(e):
            print(f"doc_id '{doc_id}' not found in Pinecone — skipping.")
            return True
        print(f"Error deleting document vectors: {str(e)}")
        return False

async def delete_user_files(user_id: str, workspace: str, bucket: str = "PDF"):
    try:
        folder_path = f"user_docs/{user_id}/{workspace}"
        print(f"Deleting all files under: {folder_path}")

        files_to_delete = []

        # Recursively collect files
        def collect_files(path):
            items = supabase.storage.from_(bucket).list(path)

            for item in items:
                item_name = item["name"]
                full_path = f"{path}/{item_name}"

                # If item has no metadata it is a folder
                if item.get("metadata") is None:
                    collect_files(full_path)
                else:
                    files_to_delete.append(full_path)

        collect_files(folder_path)

        if not files_to_delete:
            print("No files found for this user.")
            return {"status": "success", "deleted_files": 0}

        # Delete files in batch
        supabase.storage.from_(bucket).remove(files_to_delete)

        print(f"Deleted {len(files_to_delete)} files.")

        return {
            "status": "success",
            "deleted_files": len(files_to_delete)
        }

    except Exception as e:
        print(f"Error deleting user files: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user files: {str(e)}"
        )