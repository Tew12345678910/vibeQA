"""
EduQA Cloud Browser API – Test Plan → Browser-Use → simple audit (routes, good_points, problems).

Run: python -m uvicorn api.cloud_api:app --reload --host 0.0.0.0 --port 8001
"""
from dotenv import load_dotenv

load_dotenv()  # Load .env from project root (or cwd) before any code uses os.environ

from fastapi import FastAPI

from .routers import audits

app = FastAPI(title="EduQA Cloud Browser API", version="0.2.0")
app.include_router(audits.router, prefix="/audits", tags=["audits"])
