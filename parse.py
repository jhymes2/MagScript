"""Parse a play script into flashcards for one character.

Reads the clean script text (dialogue source) and the scanned PDF (page-number
source), and writes:
  cards.json          - data for the web app
  caitlin_cues.txt    - human-readable list of cues and lines

Usage: python3 parse.py ["script.txt"] ["script.pdf"]
"""

import json
import re
import sys
from difflib import SequenceMatcher

from pypdf import PdfReader

CHARACTER = "CAITLIN"
CONTEXT = 4  # speeches shown before each hidden line
TXT_PATH = "The Comeuppance.txt"
PDF_PATH = "comeuppance with text.pdf"

TAG_RE = re.compile(r"^([A-Z][A-Z ]*[A-Z])\.\s*(.*)$")
SCENE_RE = re.compile(r"^Scene\s+(\d+)\s*$")
PAREN_RE = re.compile(r"\s*\([^)]*\)\s*")


def words(text):
    return [w for w in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if w]


def clean(text):
    """Remove inline stage directions like (Distracted.) and tidy spacing."""
    text = PAREN_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def includes_character(speaker):
    if speaker == CHARACTER:
        return True
    if speaker.startswith("EVERYONE"):
        excluded = speaker.split("EXCEPT", 1)[1] if "EXCEPT" in speaker else ""
        return CHARACTER not in excluded
    return False


def parse_script(path):
    """Return (speeches, txt_words). Each speech records the index of its first
    word in txt_words so it can be located in the PDF."""
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    speeches, txt_words = [], []
    scene, current, started = None, None, False

    for line in lines:
        line_words = words(line)
        start_word = len(txt_words)
        txt_words.extend(line_words)

        stripped = line.strip()
        if stripped.lower() == "end of play":
            break
        m = SCENE_RE.match(stripped)
        if m:
            scene, current, started = int(m.group(1)), None, True
            continue
        if not started or not stripped:
            continue
        if line[:1].isspace():  # indented line = stage direction
            continue

        m = TAG_RE.match(line)
        if m:
            current = {
                "speaker": m.group(1),
                "parts": [m.group(2)],
                "scene": scene,
                "word": start_word,
            }
            speeches.append(current)
        elif current is not None:  # dialogue continuing after a direction
            current["parts"].append(stripped)

    result = []
    for s in speeches:
        text = clean(" ".join(s.pop("parts")))
        if text:
            s["text"] = text
            result.append(s)
    return result, txt_words


def parse_pdf(path):
    """Return (pdf_words, page index of each word, printed page labels)."""
    reader = PdfReader(path)
    pdf_words, pdf_word_pages, labels = [], [], []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        last = [l.strip() for l in text.splitlines() if l.strip()]
        label = last[-1] if last and last[-1].isdigit() else None
        labels.append(int(label) if label else None)
        page_words = words(text)
        pdf_words.extend(page_words)
        pdf_word_pages.extend([i] * len(page_words))
    # Fill pages with no printed number from the nearest numbered neighbour.
    for i, lab in enumerate(labels):
        if lab is None:
            for j in range(1, len(labels)):
                if i - j >= 0 and labels[i - j] is not None:
                    labels[i] = labels[i - j] + j
                    break
                if i + j < len(labels) and labels[i + j] is not None:
                    labels[i] = labels[i + j] - j
                    break
    return pdf_words, pdf_word_pages, labels


def page_lookup(txt_words, pdf_path):
    """Align script words to PDF words; return a function word_idx -> page."""
    pdf_words, pdf_word_pages, labels = parse_pdf(pdf_path)
    matcher = SequenceMatcher(None, txt_words, pdf_words, autojunk=False)
    txt_to_pdf = [None] * len(txt_words)
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            txt_to_pdf[a + k] = b + k

    def page_for(word_idx):
        # First aligned word at or after the speech start; fall back backwards.
        for i in range(word_idx, len(txt_to_pdf)):
            if txt_to_pdf[i] is not None:
                return labels[pdf_word_pages[txt_to_pdf[i]]]
        for i in range(word_idx, -1, -1):
            if txt_to_pdf[i] is not None:
                return labels[pdf_word_pages[txt_to_pdf[i]]]
        return None

    return page_for


def build_cards(speeches, page_for):
    cards = []
    for i, s in enumerate(speeches):
        if not includes_character(s["speaker"]):
            continue
        context = speeches[max(0, i - CONTEXT):i]
        cards.append({
            "id": len(cards),
            "scene": s["scene"],
            "page": page_for(s["word"]),
            "speaker": s["speaker"],
            "line": s["text"],
            "context": [{
                "speaker": p["speaker"],
                "text": p["text"],
                "page": page_for(p["word"]),
                "scene": p["scene"],
                "mine": includes_character(p["speaker"]),
            } for p in context],
        })
    return cards


def write_text(cards, path):
    with open(path, "w", encoding="utf-8") as f:
        for c in cards:
            f.write(f"--- #{c['id'] + 1}  Scene {c['scene']}, page {c['page']}\n")
            for p in c["context"]:
                f.write(f"     {p['speaker']}. {p['text']}\n")
            f.write(f">>>> {c['speaker']}. {c['line']}\n\n")


def main():
    txt_path = sys.argv[1] if len(sys.argv) > 1 else TXT_PATH
    pdf_path = sys.argv[2] if len(sys.argv) > 2 else PDF_PATH

    speeches, txt_words = parse_script(txt_path)
    page_for = page_lookup(txt_words, pdf_path)
    cards = build_cards(speeches, page_for)

    with open("cards.json", "w", encoding="utf-8") as f:
        json.dump({"character": CHARACTER, "cards": cards}, f, ensure_ascii=False, indent=1)
    write_text(cards, f"{CHARACTER.lower()}_cues.txt")
    print(f"{len(speeches)} speeches, {len(cards)} {CHARACTER} cards written.")


if __name__ == "__main__":
    main()
