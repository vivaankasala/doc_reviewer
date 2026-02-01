import re

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse

from app.schemas import AnalyzeResponse, AnalyzeTextRequest
from app.services.extract_text import extract_text
from app.services.ai_analyzer import analyze_document

router = APIRouter(prefix="/api", tags=["documents"])


def _mark_risks_in_text(text: str, risks: list) -> str:
    """Wrap risky clauses in markers for plain text export."""
    if not risks:
        return text
    result = text
    sorted_risks = sorted(risks, key=lambda r: len(r.clause or ""), reverse=True)
    for r in sorted_risks:
        clause = (r.clause or "").strip()
        if len(clause) < 5:
            continue
        pattern = re.escape(clause).replace(" ", r"\s+")
        marker = r">> [RISK - " + r.risk_level.upper() + r"] \g<0> <<"
        try:
            result = re.sub(f"({pattern})", marker, result, flags=re.IGNORECASE)
        except re.error:
            pass
    return result


def _escape_html(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _structure_as_html(text: str) -> str:
    """Convert plain text to structured HTML preserving headings, bullets, and paragraphs.
    Text may already contain <mark> tags - do not escape again."""
    lines = text.split("\n")
    result = []
    i = 0
    in_list = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            if in_list:
                result.append("</ul>")
                in_list = False
            result.append("<br>")
            i += 1
            continue

        # Bullet line: ● • - * or numbered at start (content may have <mark>)
        if re.match(r"^[\s]*(●|•|[-*]|\d+\.)\s", line) or stripped.startswith("●") or stripped.startswith("•"):
            if not in_list:
                result.append("<ul>")
                in_list = True
            content = re.sub(r"^[\s]*(●|•|[-*]|\d+\.)\s*", "", stripped)
            result.append(f"<li>{content}</li>")
            i += 1
            continue

        if in_list:
            result.append("</ul>")
            in_list = False

        # Short line that looks like a heading
        is_main_heading = i == 0 and len(stripped) < 80
        is_short_heading = len(stripped) < 60 and not stripped.endswith(".") and stripped and stripped[0].isupper()
        if is_main_heading:
            result.append(f"<h2 class='doc-title'>{stripped}</h2>")
        elif is_short_heading:
            result.append(f"<h3 class='doc-heading'>{stripped}</h3>")
        else:
            result.append(f"<p class='doc-para'>{line}</p>")
        i += 1

    if in_list:
        result.append("</ul>")

    return "\n".join(result)


def _build_html_export(text: str, summary, filename: str = "document") -> str:
    """Build HTML with in-place highlights and key points at end."""
    escaped = _escape_html(text)
    html_text = escaped
    risks = summary.flagged_risks or []
    sorted_risks = sorted(risks, key=lambda r: len(r.clause or ""), reverse=True)
    for r in sorted_risks:
        clause = (r.clause or "").strip()
        if len(clause) < 5:
            continue
        escaped_clause = _escape_html(clause)
        title = _escape_html(r.description or "")
        pattern = re.escape(escaped_clause).replace(r"\ ", r"\s+")
        try:
            repl = f'<mark class="risk-{r.risk_level}" title="{title}">\\g<0></mark>'
            html_text = re.sub(f"({pattern})", repl, html_text, flags=re.IGNORECASE)
        except re.error:
            pass

    structured = _structure_as_html(html_text)

    key_points = "".join(f"<li>{_escape_html(b)}</li>" for b in (summary.summary or []))
    questions = getattr(summary, "questions_to_ask", None) or []
    questions_html = "".join(f"<li>{_escape_html(q)}</li>" for q in questions) if questions else ""
    doc_type = summary.document_type or "Unknown"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Doc Review - {filename}</title>
<style>
body {{ font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }}
.document {{ margin-bottom: 2rem; }}
.document .doc-title {{ font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.5rem; }}
.document .doc-heading {{ font-size: 1.15rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }}
.document .doc-para {{ margin: 0.5rem 0; text-align: justify; }}
.document ul {{ margin: 0.5rem 0; padding-left: 1.5rem; }}
.document li {{ margin: 0.25rem 0; }}
mark.risk-low {{ background: rgba(34, 197, 94, 0.3); border-bottom: 2px solid #22c55e; padding: 0 2px; }}
mark.risk-medium {{ background: rgba(234, 179, 8, 0.3); border-bottom: 2px solid #eab308; padding: 0 2px; }}
mark.risk-high {{ background: rgba(239, 68, 68, 0.3); border-bottom: 2px solid #ef4444; padding: 0 2px; }}
.key-points, .questions-section {{ background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; }}
.key-points {{ border-left: 4px solid #6366f1; }}
.questions-section {{ border-left: 4px solid #22c55e; }}
.key-points h2, .questions-section h2 {{ margin-top: 0; font-size: 1.1rem; }}
.key-points ul, .questions-section ul {{ margin: 0; padding-left: 1.25rem; }}
</style>
</head>
<body>
<h1>Document Review</h1>
<p><strong>File:</strong> {filename} &nbsp;|&nbsp; <strong>Type:</strong> {doc_type}</p>
<div class="document">{structured}</div>
<div class="key-points">
<h2>Key Points</h2>
<ul>{key_points}</ul>
</div>""" + (f"""
<div class="questions-section">
<h2>Questions to Ask Before Signing</h2>
<ul>{questions_html}</ul>
</div>""" if questions_html else "") + """
</body>
</html>"""


@router.post("/extract")
async def extract(file: UploadFile = File(...)):
    """Extract text from document. Supports PDF, Word, and scanned images."""
    data = await file.read()
    try:
        text = extract_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    try:
        text = extract_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    try:
        text = extract_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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


@router.post("/export/from-text")
async def export_from_text(body: AnalyzeTextRequest):
    """Export pasted text as .txt: document with marked risks + key points."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    try:
        result = analyze_document(text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    marked = _mark_risks_in_text(text, result.flagged_risks or [])
    lines = [
        "=== DOCUMENT (flagged clauses marked with >> [RISK - level] ... <<) ===",
        "",
        marked,
        "",
        "",
        "=== KEY POINTS ===",
        "",
    ]
    for bullet in result.summary or []:
        lines.append(f"• {bullet}")
    lines.append("")
    questions = getattr(result, "questions_to_ask", None) or []
    if questions:
        lines.append("=== QUESTIONS TO ASK BEFORE SIGNING ===")
        lines.append("")
        for q in questions:
            lines.append(f"? {q}")
        lines.append("")
    if result.document_type:
        lines.append(f"Document type: {result.document_type}")
    lines.append("")
    if result.flagged_risks:
        lines.append("=== FLAGGED RISKS ===")
        for i, r in enumerate(result.flagged_risks, 1):
            lines.append(f"{i}. [{r.risk_level.upper()}] {r.description}")
            lines.append(f"   Clause: {r.clause[:300]}{'...' if len(r.clause) > 300 else ''}")
            lines.append("")

    content = "\n".join(lines)
    return PlainTextResponse(
        content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=document-review.txt"},
    )


@router.post("/export/from-file")
async def export_from_file(file: UploadFile = File(...)):
    """Export uploaded file as .html: document with highlighted risks in place + key points at end."""
    data = await file.read()
    try:
        text = extract_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found.")

    try:
        result = analyze_document(text)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    filename = file.filename or "document"
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    html = _build_html_export(text, result, filename)

    return HTMLResponse(
        html,
        headers={"Content-Disposition": f"attachment; filename={base}-review.html"},
    )
