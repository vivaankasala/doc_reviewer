"""
Extract text from PDF, Word (.docx), and scanned images.
Supports native text extraction and OCR fallback for scanned docs.
"""
import io
import re

import pdfplumber
from docx import Document


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_pdf_native(data: bytes) -> str:
    parts = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
    return _clean("\n\n".join(parts))


def _extract_pdf_ocr(data: bytes) -> str:
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
        from PIL import Image
    except ImportError:
        return ""
    try:
        images = convert_from_bytes(data, dpi=200)
        parts = []
        for img in images:
            text = pytesseract.image_to_string(img, lang="eng")
            if text.strip():
                parts.append(text)
        return _clean("\n\n".join(parts))
    except Exception:
        return ""


def _extract_image_ocr(data: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image, ImageEnhance
    except ImportError as e:
        raise ValueError(
            "Image OCR requires pytesseract and Pillow. Install: pip install pytesseract Pillow"
        ) from e
    try:
        img = Image.open(io.BytesIO(data))
        # Convert to RGB - PNG screenshots often have alpha, pytesseract works best with RGB
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        # Improve OCR on screenshots: slight contrast boost
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.15)
        text = pytesseract.image_to_string(img, lang="eng")
        return _clean(text)
    except Exception as e:
        err = str(e).lower()
        if "tesseract" in err or "not found" in err:
            raise ValueError(
                "Tesseract OCR is not installed. On Mac: brew install tesseract"
            ) from e
        raise ValueError(f"Image OCR failed: {e}") from e


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        text = _extract_pdf_native(data)
        if not text.strip():
            text = _extract_pdf_ocr(data)
        return text

    if name.endswith(".docx"):
        doc = Document(io.BytesIO(data))
        paras = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        return _clean("\n".join(paras))

    if name.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp")):
        return _extract_image_ocr(data)

    return ""
