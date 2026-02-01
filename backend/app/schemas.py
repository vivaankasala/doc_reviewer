from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class FlaggedRisk(BaseModel):
    clause: str = Field(..., description="The specific text or clause")
    risk_level: str = Field(..., description="low, medium, or high")
    description: str = Field(..., description="Why this may be concerning")


class DocumentSummary(BaseModel):
    summary: list[str] = Field(..., description="Bullet-point summary")
    flagged_risks: list[FlaggedRisk] = Field(default_factory=list)
    document_type: Optional[str] = Field(None, description="Detected document type")
    word_count: int = Field(0)
    questions_to_ask: list[str] = Field(default_factory=list, description="Questions to clarify before signing")


class AnalyzeResponse(BaseModel):
    filename: str
    full_text: str
    summary: DocumentSummary
    char_count: int


class AnalyzeTextRequest(BaseModel):
    text: str
