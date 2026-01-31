"""
AI analysis: summary + risk flagging for documents.
Uses OpenAI to generate bullet-point summaries and flag unusual/risky clauses.
"""
import json
from typing import Optional

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.schemas import DocumentSummary, FlaggedRisk
from openai import OpenAI

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is not set. Add it to .env")
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a document review assistant helping users understand long documents before signing.

For each document:
1. Give a clear bullet-point summary (5–12 bullets) of main points, parties, obligations, deadlines, and key terms.
2. Flag unusual, one-sided, or risky clauses. For each: quote the clause, assign risk level (low/medium/high), explain the concern.
3. Identify document type if possible (e.g., lease, NDA, employment agreement). Use "Unknown" otherwise.

Respond ONLY with valid JSON:
{
  "summary": ["bullet 1", "bullet 2", ...],
  "document_type": "type or null",
  "flagged_risks": [
    {"clause": "quote or paraphrase", "risk_level": "low|medium|high", "description": "why concerning"}
  ]
}

Be thorough but concise. Flag genuinely concerning clauses, not normal boilerplate."""


def analyze_document(text: str, model: Optional[str] = None) -> DocumentSummary:
    client = _get_client()
    m = model or OPENAI_MODEL

    response = client.chat.completions.create(
        model=m,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze this document:\n\n{text[:120000]}"},
        ],
        temperature=0.2,
    )

    content = response.choices[0].message.content
    raw = json.loads(content)

    risks = [
        FlaggedRisk(
            clause=r.get("clause", ""),
            risk_level=r.get("risk_level", "low"),
            description=r.get("description", ""),
        )
        for r in raw.get("flagged_risks", [])
    ]

    word_count = len(text.split())
    return DocumentSummary(
        summary=raw.get("summary", []),
        flagged_risks=risks,
        document_type=raw.get("document_type"),
        word_count=word_count,
    )
