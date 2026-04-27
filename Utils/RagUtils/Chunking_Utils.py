from typing import List, Dict, Tuple
import nltk
import tiktoken
import re

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

tokenizer = tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str) -> int:
    return len(tokenizer.encode(text))

# ─────────────────────────────────────────────────────────────────────────────
# HEADING DETECTION
# ─────────────────────────────────────────────────────────────────────────────
HEADING_PATTERNS = [
    r"^#{1,6}\s+.+",
    r"^\d+\.\s+[A-Z][^\n]{3,60}$",
    r"^\d+\.\d+\s+[A-Z][^\n]{3,60}$",
    r"^[A-Z][A-Z\s]{4,50}$",
    r"^(Chapter|Section|Part|Appendix)\s+\w",
    r"^[A-Z][^.!?]{5,60}:$",
    r"^([A-Z][a-z]+)(\s+[A-Z][a-z]+){1,5}$",
]
HEADING_REGEX = re.compile("|".join(f"({p})" for p in HEADING_PATTERNS), re.MULTILINE)

def is_heading(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 80:
        return False
    if line.endswith(".") and " " in line:
        return False
    return bool(HEADING_REGEX.match(line))

def is_list_item(line: str) -> bool:
    return bool(re.match(
        r"^(\s*[-•*▪◦\u2022\u2023\u25E6\u2043\u2219]\s+|\s*\d+[.)]\s+)",
        line
    ))

# ─────────────────────────────────────────────────────────────────────────────
# TABLE DETECTION — Pattern-based for PDF extracted text
# ─────────────────────────────────────────────────────────────────────────────

# Keywords that strongly indicate a table header row
TABLE_HEADER_KEYWORDS = re.compile(
    r"\b(Name|Type|Date|Length|Duration|Year|Years|Department|Major|Course|"
    r"Code|Price|Amount|Total|Status|Category|Description|ID|No|Number|"
    r"Title|Role|Level|Grade|Score|Mark|Result|Section|Module|Subject)\b",
    re.IGNORECASE
)

def score_table_line(line: str) -> float:
    """
    Score how likely a line is a table row (0.0 to 1.0).
    Uses multiple signals since PDF tables lose spacing.
    """
    stripped = line.strip()
    if not stripped or len(stripped) < 5:
        return 0.0

    score = 0.0

    # Signal 1: pipe-separated (explicit table)
    if stripped.count("|") >= 2:
        return 1.0

    # Signal 2: 2+ space separation (semi-structured)
    parts_2space = re.split(r"\s{2,}", stripped)
    if len(parts_2space) >= 3:
        score += 0.6

    # Signal 3: contains table header keywords
    keyword_matches = len(TABLE_HEADER_KEYWORDS.findall(stripped))
    if keyword_matches >= 2:
        score += 0.4
    elif keyword_matches == 1:
        score += 0.2

    # Signal 4: ends with year/number pattern (common in academic/business tables)
    if re.search(r"\b\d{1,4}\s*(Years?|Months?|Days?|Hours?)?\s*$", stripped, re.IGNORECASE):
        score += 0.3

    # Signal 5: short line with multiple capitalized words (table cell pattern)
    words = stripped.split()
    if len(words) <= 6:
        cap_words = sum(1 for w in words if w[0].isupper())
        if cap_words >= 3:
            score += 0.2

    # Signal 6: line is very short and looks like a continuation cell
    if len(stripped) <= 30 and not stripped.endswith("."):
        score += 0.1

    return min(score, 1.0)


def is_table_row(line: str) -> bool:
    return "|" in line and line.count("|") >= 2


def looks_like_table_line(line: str) -> bool:
    return score_table_line(line) >= 0.5

# ─────────────────────────────────────────────────────────────────────────────
# SMARTER SEGMENT SPLITTER — Uses context window for table detection
# ─────────────────────────────────────────────────────────────────────────────

def classify_line(line: str) -> str:
    stripped = line.strip()
    if not stripped:
        return "empty"
    if is_table_row(stripped) or looks_like_table_line(stripped):
        return "table"
    if is_list_item(stripped):
        return "list"
    return "paragraph"


def split_into_segments(text: str) -> List[Dict]:
    """
    Splits mixed content into typed segments using a context-aware window.
    Consecutive lines of same type are grouped together.
    Uses lookahead to avoid splitting mid-table when one row scores low.
    """
    lines = text.split("\n")

    # Pre-classify all lines
    classified = [(line, classify_line(line)) for line in lines]

    # Context smoothing: if a line is surrounded by table lines, reclassify it
    types = [t for _, t in classified]
    smoothed = list(types)

    for i in range(1, len(types) - 1):
        if types[i] == "paragraph":
            prev = types[i - 1]
            nxt  = types[i + 1]
            # Surrounded by table lines → likely a wrapped table cell
            if prev == "table" and nxt == "table":
                smoothed[i] = "table"
            # Short line between table lines
            elif prev == "table" and len(classified[i][0].strip()) <= 40:
                smoothed[i] = "table"

    # Build segments by grouping consecutive same-type lines
    segments = []
    current_lines = []
    current_type = None

    def flush():
        if current_lines:
            content = "\n".join(current_lines).strip()
            if content:
                segments.append({"type": current_type, "text": content})

    for (line, _), line_type in zip(classified, smoothed):
        if line_type == "empty":
            if current_lines:
                current_lines.append(line)
            continue

        if current_type is None:
            current_type = line_type

        if line_type != current_type:
            flush()
            current_lines = []
            current_type = line_type

        current_lines.append(line)

    flush()
    return segments if segments else [{"type": "paragraph", "text": text}]

# ─────────────────────────────────────────────────────────────────────────────
# SECTION PARSER
# ─────────────────────────────────────────────────────────────────────────────

def parse_sections(text: str) -> List[Dict]:
    lines = text.split("\n")
    sections = []
    current_title = "General"
    current_lines = []

    def flush(lines, title):
        body = "\n".join(lines).strip()
        if body:
            sections.append({"title": title, "text": body})

    for line in lines:
        stripped = line.strip()
        if not stripped:
            current_lines.append(line)
            continue
        if is_heading(stripped):
            flush(current_lines, current_title)
            current_title = stripped.lstrip("#").strip()
            current_lines = []
        else:
            current_lines.append(line)

    flush(current_lines, current_title)
    return sections if sections else [{"title": "General", "text": text}]

# ─────────────────────────────────────────────────────────────────────────────
# CHUNKING STRATEGIES
# ─────────────────────────────────────────────────────────────────────────────

def chunk_paragraph(text: str, token_size: int, overlap_size: int) -> List[str]:
    sentences = nltk.sent_tokenize(text)
    chunks, current, current_tokens = [], [], 0

    for sentence in sentences:
        s_tokens = count_tokens(sentence)

        # Split oversized sentences by words
        if s_tokens > token_size:
            if current:
                chunks.append(" ".join(current))
                current, current_tokens = [], 0
            words, temp, temp_tokens = sentence.split(), [], 0
            for word in words:
                w_tokens = count_tokens(word)
                if temp_tokens + w_tokens > token_size and temp:
                    chunks.append(" ".join(temp))
                    temp, temp_tokens = [], 0
                temp.append(word)
                temp_tokens += w_tokens
            if temp:
                chunks.append(" ".join(temp))
            continue

        if current_tokens + s_tokens > token_size and current:
            chunks.append(" ".join(current))
            # Overlap carry-forward
            overlap, overlap_tokens = [], 0
            for sent in reversed(current):
                t = count_tokens(sent)
                if overlap_tokens + t <= overlap_size:
                    overlap.insert(0, sent)
                    overlap_tokens += t
                else:
                    break
            current, current_tokens = overlap, overlap_tokens

        current.append(sentence)
        current_tokens += s_tokens

    if current:
        chunks.append(" ".join(current))
    return chunks


def chunk_list(text: str, token_size: int) -> List[str]:
    items = [l for l in text.split("\n") if l.strip()]
    chunks, current, current_tokens = [], [], 0

    for item in items:
        t = count_tokens(item)
        if current_tokens + t > token_size and current:
            chunks.append("\n".join(current))
            current, current_tokens = [], 0
        current.append(item)
        current_tokens += t

    if current:
        chunks.append("\n".join(current))
    return chunks


def chunk_table(text: str, token_size: int) -> List[str]:
    rows = [r for r in text.split("\n") if r.strip()]
    if not rows:
        return []

    header = rows[0]
    header_tokens = count_tokens(header)
    chunks, current, current_tokens = [], [header], header_tokens

    for row in rows[1:]:
        t = count_tokens(row)
        if current_tokens + t > token_size and len(current) > 1:
            chunks.append("\n".join(current))
            current = [header]          # always restart with header
            current_tokens = header_tokens
        current.append(row)
        current_tokens += t

    if len(current) > 1:
        chunks.append("\n".join(current))
    elif len(current) == 1 and chunks:
        pass  # header-only leftover, discard
    elif len(current) == 1:
        chunks.append(current[0])

    return chunks


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

async def hierarchical_semantic_chunking(
    pages, workspace_name, document_id,
    token_size=350, overlap_size=60):
    all_chunks = []

    for page in pages:
        page_num = page["page_number"]
        text = page.get("text", "").strip()
        if not text:
            continue

        print(f"\n── Page {page_num} ({len(text)} chars) ──")

        sections = parse_sections(text)
        print(f"   Sections found: {len(sections)} → {[s['title'] for s in sections]}")

        for section in sections:
            segments = split_into_segments(section["text"])
            print(f"   Section '{section['title']}': {len(segments)} segments → {[s['type'] for s in segments]}")

            for segment in segments:
                seg_type = segment["type"]
                seg_text = segment["text"].strip()
                if not seg_text:
                    continue

                if seg_type == "table":
                    raw_chunks = chunk_table(seg_text, token_size)
                elif seg_type == "list":
                    raw_chunks = chunk_list(seg_text, token_size)
                else:
                    raw_chunks = chunk_paragraph(seg_text, token_size, overlap_size)

                print(f"     [{seg_type}] → {len(raw_chunks)} chunks")

                for chunk_text in raw_chunks:
                    chunk_text = chunk_text.strip()
                    token_count = count_tokens(chunk_text)
                    if not chunk_text or token_count < 20:
                        continue
                    all_chunks.append({
                        "workspace_name": workspace_name,
                        "document_id":    document_id,
                        "page_number":    page_num,
                        "section_title":  section["title"],
                        "content_type":   seg_type,
                        "chunk_index":    len(all_chunks),
                        "token_count":    token_count,
                        "text":           chunk_text,
                    })

    print(f"\nTotal chunks created: {len(all_chunks)}")
    return all_chunks

