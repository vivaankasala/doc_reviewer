from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse

from app.schemas import AnalyzeResponse, AnalyzeTextRequest
from app.services.extract_text import extract_text
from app.services.ai_analyzer import analyze_document

router = APIRouter(prefix="/api", tags=["documents"])


@router.post("/extract")
async def extract(file: UploadFile = File(...)):
    """Extract text from document. Supports PDF, Word, and scanned images."""
    data = await file.read()
    text = extract_text(file.filename or "", data)

    if not text or not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found. Supported: PDF, DOCX, PNG, JPG, TIFF.",
        )

    return {
        "filename": file.filename,
        "characters": len(text),
        "preview": text[:1000],
    }


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)):
    """Upload a document for full AI analysis: summary + flagged risks."""
    data = await file.read()
    text = extract_text(file.filename or "", data)

    if not text or not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found. Supported: PDF, DOCX, PNG, JPG, TIFF.",
        )

    try:
        summary = analyze_document(text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return AnalyzeResponse(
        filename=file.filename or "document",
        full_text=text,
        summary=summary,
        char_count=len(text),
    )


@router.post("/analyze-text")
async def analyze_text(body: AnalyzeTextRequest):
    """Analyze raw text. Body: {"text": "..."}"""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        result = analyze_document(text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"summary": result.model_dump(), "char_count": len(text)}


@router.post("/export/summary")
async def export_summary(file: UploadFile = File(...)):
    """Analyze document and return summary as downloadable text file."""
    data = await file.read()
    text = extract_text(file.filename or "", data)

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found.")

    try:
        result = analyze_document(text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    lines = [
        "# Document Summary",
        "",
        "## Key Points",
        "",
    ]
    for bullet in result.summary:
        lines.append(f"- {bullet}")
    lines.append("")

    if result.document_type:
        lines.append(f"**Document type:** {result.document_type}")
        lines.append("")

    if result.flagged_risks:
        lines.append("## Flagged Risks")
        lines.append("")
        for i, r in enumerate(result.flagged_risks, 1):
            lines.append(f"### {i}. [{r.risk_level.upper()}] {r.description}")
            lines.append("")
            lines.append(f"> {r.clause[:500]}{'...' if len(r.clause) > 500 else ''}")
            lines.append("")

    content = "\n".join(lines)
    return PlainTextResponse(
        content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=document-summary.txt"},
    )
