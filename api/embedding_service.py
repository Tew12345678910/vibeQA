"""
Sentence-transformers embedding service helper.
"""
from functools import lru_cache
from typing import List

from sentence_transformers import SentenceTransformer


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    return SentenceTransformer(DEFAULT_MODEL)


def get_embedding_dimension() -> int:
    model = get_model()
    return int(model.get_sentence_embedding_dimension())


def embed_text(text: str) -> List[float]:
    model = get_model()
    vector = model.encode(text, normalize_embeddings=True).tolist()
    return [float(v) for v in vector]

