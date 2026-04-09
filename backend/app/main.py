import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import cell_count, feedback, upload

app = FastAPI(title="Lab Tools API")

allowed_origins = [
    "http://localhost:5173",
]
# In production, allow the Render frontend URL
if os.getenv("FRONTEND_URL"):
    allowed_origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cell_count.router, prefix="/api/cell-count", tags=["cell-count"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
