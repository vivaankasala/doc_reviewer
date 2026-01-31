# Doc Reviewer

**Review long documents before signing** — upload a contract, NDA, or agreement and get an AI-powered summary plus flagged risks in seconds.

## What It Does

- **Upload** PDF, Word (.docx), or scanned images (PNG, JPG, TIFF)
- **AI extracts text** (with OCR fallback for scanned docs)
- **Generates a bullet-point summary** of key terms, parties, and obligations
- **Flags risky or unusual clauses** with risk levels and explanations
- **Export** the summary as a text file

## Quick Start

### 1. Backend setup

```bash
cd doc-reviewer/backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Add your OpenAI API key

```bash
cp ../.env.example .env
# Edit .env and set: OPENAI_API_KEY=sk-your-key
```

### 3. Run

```bash
uvicorn app.main:app --reload
```

Open **http://localhost:8000** — the frontend is served automatically.

## OCR for PNG / Image Uploads (Required for Screenshots)

PNG and image uploads use Tesseract OCR. Install it:

- **macOS:** `brew install tesseract`
- **Ubuntu:** `apt install tesseract-ocr`

For scanned PDFs, also install poppler: `brew install poppler`

## Project Structure

```
doc-reviewer/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Env config
│   │   ├── schemas.py           # Pydantic models
│   │   ├── routes/
│   │   │   └── documents.py     # API endpoints
│   │   └── services/
│   │       ├── extract_text.py  # PDF, DOCX, image extraction
│   │       └── ai_analyzer.py   # OpenAI summary + risk flagging
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/extract` | Extract text only |
| POST | `/api/analyze` | Full analysis (summary + risks) |
| POST | `/api/analyze-text` | Analyze raw text (JSON: `{"text": "..."}`) |
| POST | `/api/export/summary` | Analyze and return summary file |

API docs: http://localhost:8000/docs
