"""
EduQA Cloud Browser API – Test Plan → Browser-Use → Reviewer AI → CloudAuditPayload.

Entrypoint: uvicorn aws.cloud_api:app --reload --host 0.0.0.0 --port 8001
"""
from fastapi import FastAPI

from .routers import audits, embeddings

app = FastAPI(title="EduQA Cloud Browser API", version="0.2.0")
app.include_router(audits.router, prefix="/audits", tags=["audits"])
app.include_router(embeddings.router, prefix="/embeddings", tags=["embeddings"])
