import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.documents import router as documents_router

app = FastAPI(
    title="Doc Reviewer API",
    description="Summarize documents and flag risks before signing",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)

# Serve frontend
_frontend = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.exists(_frontend):
    app.mount("/", StaticFiles(directory=_frontend, html=True), name="frontend")


@app.get("/health")
def health():
    return {"ok": True}
