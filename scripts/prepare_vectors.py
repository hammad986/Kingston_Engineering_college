#!/usr/bin/env python3
"""
Kingston Engineering College — Vector Binary Converter
======================================================
Converts vector-index.json to a binary Float32Array file for efficient
loading in the browser Web Worker.

Output:
    data/vectors.bin        — Raw float32 vectors (count * dimension * 4 bytes)
    data/vectors-meta.json  — Metadata (count, dimension, model)

Usage:
    python scripts/prepare_vectors.py
"""

import json
import struct
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = PROJECT_ROOT / "data" / "vector-index.json"
BIN_PATH = PROJECT_ROOT / "data" / "vectors.bin"
META_PATH = PROJECT_ROOT / "data" / "vectors-meta.json"

def main():
    print("=" * 60)
    print("Vector Binary Converter")
    print("=" * 60)

    if not INDEX_PATH.exists():
        print(f"  [ERROR] {INDEX_PATH} not found.")
        print(f"  Run 'python scripts/rebuild_kb.py' first.")
        sys.exit(1)

    print(f"  Loading: {INDEX_PATH}")
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    embeddings = data.get("embeddings", [])
    count = data.get("count", len(embeddings))
    dim = data.get("dimension", 384)
    model = data.get("model", "unknown")

    print(f"  Vectors:     {count:,}")
    print(f"  Dimension:   {dim}")
    print(f"  Model:       {model}")
    print(f"  JSON size:   {os.path.getsize(INDEX_PATH) / (1024*1024):.1f} MB")

    # Convert to binary format: [count:uint32][dim:uint32][vectors:float32[]]
    print(f"  Converting to binary...")

    # Write as raw little-endian float32 array
    bin_size = count * dim * 4  # 4 bytes per float32
    print(f"  Binary size: {bin_size / (1024*1024):.1f} MB")

    with open(BIN_PATH, "wb") as f:
        # Write header: count (uint32) + dimension (uint32)
        f.write(struct.pack("<II", count, dim))
        # Write all vectors as float32
        for vec in embeddings:
            f.write(struct.pack(f"<{dim}f", *vec))

    print(f"  Written:     {BIN_PATH}")

    # Write metadata
    meta = {
        "count": count,
        "dimension": dim,
        "model": model,
        "bin_file": "vectors.bin",
        "bin_size_bytes": bin_size,
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"  Written:     {META_PATH}")
    print(f"  Compression: {os.path.getsize(INDEX_PATH) / bin_size:.1f}x smaller than JSON")
    print()
    print("  Done. Ready for RAG chatbot deployment.")
    print()


if __name__ == "__main__":
    main()
