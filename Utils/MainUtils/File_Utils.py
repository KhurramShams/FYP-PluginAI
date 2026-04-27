from fastapi import UploadFile
from Integrations.pinecone_client import supabase
from docx import Document as DocxDocument
from io import BytesIO
from typing import List, Dict, Optional
import re
import pdfplumber

# Function to extract text from PDF
async def upload_file(file: UploadFile, user_id: str, doc_id: str):
    file_bytes = await file.read()
    
    file_path = f"user_docs/{user_id}/{doc_id}/{file.filename}"

    res = supabase.storage.from_("PDF").upload(
        file_path,
        file_bytes
    )

    return {"message": "File uploaded", "path": file_path}

def extract_docx(file_bytes: bytes) -> List[Dict]:
    """
    Extract from Word doc — preserves headings, paragraphs, and tables.
    Groups content into logical pseudo-pages of ~3000 chars each.
    """
    doc = DocxDocument(BytesIO(file_bytes))
    blocks = []

    for element in doc.element.body:
        tag = element.tag.split("}")[-1]

        if tag == "p":
            para = DocxDocument.element_factory(element) if hasattr(
                DocxDocument, "element_factory") else None
            # Use python-docx paragraph style detection
            from docx.oxml.ns import qn
            style = element.find(
                ".//{%s}pStyle" % "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            )
            style_name = style.get(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", ""
            ) if style is not None else ""

            text = "".join(
                node.text for node in element.iter()
                if node.tag.endswith("}t") and node.text
            ).strip()

            if text:
                is_heading = "Heading" in style_name or style_name.startswith("h")
                blocks.append({
                    "type": "heading" if is_heading else "paragraph",
                    "text": text,
                    "style": style_name
                })

        elif tag == "tbl":
            # Extract table as structured text
            rows = []
            for row in element.iter(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr"
            ):
                cells = [
                    "".join(
                        n.text for n in cell.iter()
                        if n.tag.endswith("}t") and n.text
                    ).strip()
                    for cell in row.iter(
                        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc"
                    )
                ]
                if any(cells):
                    rows.append(" | ".join(cells))
            if rows:
                blocks.append({
                    "type": "table",
                    "text": "\n".join(rows),
                    "style": "table"
                })

    # Group blocks into pseudo-pages (~3000 chars)
    pages = []
    current_text = []
    current_len = 0
    page_num = 1

    for block in blocks:
        text = block["text"]
        if current_len + len(text) > 3000 and current_text:
            pages.append({
                "page_number": page_num,
                "text": "\n\n".join(current_text)
            })
            page_num += 1
            current_text = []
            current_len = 0
        current_text.append(text)
        current_len += len(text)

    if current_text:
        pages.append({
            "page_number": page_num,
            "text": "\n\n".join(current_text)
        })

    return pages

def extract_txt(file_bytes: bytes) -> List[Dict]:
    """
    Extract plain text — groups lines into logical pseudo-pages
    by detecting blank-line separated paragraphs.
    """
    text = file_bytes.decode("utf-8", errors="ignore")
    text = clean_text(text)

    # Split by double newlines (paragraph breaks)
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    # Group paragraphs into pseudo-pages (~3000 chars)
    pages = []
    current_text = []
    current_len = 0
    page_num = 1

    for para in paragraphs:
        if current_len + len(para) > 3000 and current_text:
            pages.append({
                "page_number": page_num,
                "text": "\n\n".join(current_text)
            })
            page_num += 1
            current_text = []
            current_len = 0
        current_text.append(para)
        current_len += len(para)

    if current_text:
        pages.append({
            "page_number": page_num,
            "text": "\n\n".join(current_text)
        })

    return pages

def clean_text(text: str) -> str:
    """Normalize whitespace while preserving document structure."""
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Collapse multiple blank lines to max 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse horizontal spaces (not newlines)
    text = re.sub(r"[ \t]+", " ", text)

    # ✅ Only remove truly unprintable control chars, keep bullets/dashes/UTF-8
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    return text.strip()

async def text_extraction_page_wise(file_bytes: bytes, file_ext: str) -> List[Dict]:
    try:
        if file_ext == "pdf":
            return extract_pdf(file_bytes)
        elif file_ext == "docx":
            return extract_docx(file_bytes)
        elif file_ext == "txt":
            return extract_txt(file_bytes)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
    except Exception as e:
        print(f"Extraction error: {str(e)}")
        return []

def clean_table(raw_table: List[List[Optional[str]]]) -> str:

    if not raw_table:
        return ""

    # Step 1: Replace None with empty string, strip whitespace
    cleaned = []
    for row in raw_table:
        cleaned_row = [
            (cell.replace("\n", " ").strip() if cell else "")
            for cell in row
        ]
        cleaned.append(cleaned_row)

    # Step 2: Remove duplicate/phantom columns
    header = cleaned[0]
    real_col_indices = []
    for idx, cell in enumerate(header):
        # Keep column if header has content OR if any row has content there
        col_values = [cleaned[r][idx] for r in range(len(cleaned)) if idx < len(cleaned[r])]
        if any(v for v in col_values):
            real_col_indices.append(idx)

    # Step 3: Extract only real columns
    filtered = []
    for row in cleaned:
        filtered_row = [row[idx] for idx in real_col_indices if idx < len(row)]
        filtered.append(filtered_row)

    # Step 4: Forward-fill empty cells (handle merged/spanned cells)
    num_cols = max(len(row) for row in filtered)
    last_values = [""] * num_cols

    filled = []
    for row in filtered:
        filled_row = []
        for col_idx in range(num_cols):
            val = row[col_idx] if col_idx < len(row) else ""
            if val:
                last_values[col_idx] = val
                filled_row.append(val)
            else:
                # Only forward-fill non-header rows
                if filled:  # not the header row
                    filled_row.append(last_values[col_idx])
                else:
                    filled_row.append("")
        filled.append(filled_row)

    # Step 5: Convert to pipe-separated string, skip empty rows
    lines = []
    for row in filled:
        row_text = " | ".join(cell for cell in row)
        if any(cell.strip() for cell in row):
            lines.append(row_text)

    return "\n".join(lines)

def extract_pdf(file_bytes: bytes) -> List[Dict]:

    pages = []

    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):

            # ── Extract tables ────────────────────────────────────────────
            raw_tables = page.extract_tables()
            table_texts = []
            for raw_table in raw_tables:
                table_str = clean_table(raw_table)
                if table_str.strip():
                    table_texts.append(table_str)

            # ── Extract prose text (excluding table bounding boxes) ───────
            # Remove table areas from page before extracting text
            page_without_tables = page
            if raw_tables:
                table_bboxes = [t.bbox for t in page.find_tables()]
                for bbox in table_bboxes:
                    page_without_tables = page_without_tables.filter(
                        lambda obj, bb=bbox: not (
                            bb[0] <= obj["x0"] and obj["x1"] <= bb[2] and
                            bb[1] <= obj["top"] and obj["bottom"] <= bb[3]
                        )
                    )

            prose_text = page_without_tables.extract_text() or ""
            prose_text = clean_text(prose_text)

            # ── Combine: prose first, then tables as clean | rows ─────────
            combined_parts = []
            if prose_text.strip():
                combined_parts.append(prose_text)
            for table_text in table_texts:
                combined_parts.append(table_text)

            combined = "\n\n".join(combined_parts).strip()

            if combined:
                pages.append({"page_number": i + 1, "text": combined})

            # Debug
            print(f"\n── EXTRACTED PAGE {i+1} ──")
            print(f"Prose ({len(prose_text)} chars)")
            print(f"Tables: {len(table_texts)} | Rows per table: {[len(t.splitlines()) for t in table_texts]}")
            print(f"Sample table output:\n{table_texts[0][:300] if table_texts else 'none'}")

    return pages