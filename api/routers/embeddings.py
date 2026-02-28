"""
Embedding routes for local RAG service.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..embedding_service import DEFAULT_MODEL, embed_text, get_embedding_dimension

router = APIRouter()


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int
    model: str


@router.get("/health")
async def embedding_health() -> dict[str, object]:
    return {
        "ok": True,
        "model": DEFAULT_MODEL,
        "dimensions": get_embedding_dimension(),
    }


@router.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest) -> EmbedResponse:
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")

    try:
        vector = embed_text(text)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate embedding: {error}",
        ) from error

    return EmbedResponse(
        embedding=vector,
        dimensions=len(vector),
        model=DEFAULT_MODEL,
    )

