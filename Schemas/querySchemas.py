from uuid import UUID
from pydantic import BaseModel
from typing import Optional

class PortalQueryRequest(BaseModel):
    query: str
    workspace_name: str  # User-specific namespace
    unique_id: str


class ApiKeyQueryRequest(BaseModel):
    query: str
    Api_key: str
    workspace_name: str  # User-specific namespace
    unique_id: str
