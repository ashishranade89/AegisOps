import json
import logging
from pathlib import Path
from datetime import datetime
from langchain_core.documents import Document
from langchain.tools import tool
from backend.utils.config import get_config

logger = logging.getLogger(__name__)
config = get_config()

# Relative database storage path (resolves to workspace root / incident_memory_db)
DB_DIR = Path(__file__).parent.parent.parent / "incident_memory_db"
DB_DIR.mkdir(exist_ok=True, parents=True)

def get_model_suffix(model_name: str | None) -> str:
    """Sanitizes model name to be used as a file and collection suffix."""
    if not model_name:
        return "default"
    # replace slashes, colons, spaces with underscores
    safe_name = model_name.replace("/", "_").replace(":", "_").replace(" ", "_").lower()
    return safe_name

def get_vector_store_and_fallback_path(model_name: str | None, api_key: str = None, base_url: str = None):
    """Dynamically initializes vector store and fallback JSON path for a given model configuration."""
    suffix = get_model_suffix(model_name)
    json_path = DB_DIR / f"incident_memory_fallback_{suffix}.json"
    
    # Try initializing ChromaDB
    vs = None
    target_key = api_key or config.openrouter_api_key
    target_base = base_url or config.openrouter_base_url
    
    # Inject placeholder for local validation if needed
    if not target_key and target_base and ("localhost" in target_base or "127.0.0.1" in target_base):
        target_key = "ollama" if "11434" in target_base else "lm-studio"
        
    try:
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import Chroma
        
        # If it's a local model, we use the local model base URL
        emb = OpenAIEmbeddings(
            model="text-embedding-3-small" if not base_url else (model_name or "text-embedding-3-small"),
            base_url=target_base,
            openai_api_key=target_key
        )
        
        persist_dir = str(DB_DIR / f"chroma_{suffix}")
        vs = Chroma(
            collection_name=f"incident_history_{suffix}",
            embedding_function=emb,
            persist_directory=persist_dir
        )
        logger.info(f"ChromaDB initialized for model suffix '{suffix}' successfully.")
    except Exception as e:
        logger.warning("Failed to initialize ChromaDB for model %s (%s). Using JSON fallback.", model_name, e)
        vs = None
        
    return vs, json_path

def _load_json_db(json_path: Path) -> list[dict]:
    if not json_path.exists():
        return []
    try:
        with open(json_path, "r") as f:
            return json.load(f)
    except Exception:
        return []

def _save_json_db(json_path: Path, data: list[dict]):
    try:
        with open(json_path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error("Failed to write to fallback JSON database: %s", e)

def _json_similarity_search(json_path: Path, query: str, k: int = 2) -> list[tuple[dict, float]]:
    """Simulates a semantic search via keyword scoring."""
    db = _load_json_db(json_path)
    query_words = set(query.lower().replace(":", " ").replace(".", " ").split())
    
    results = []
    for doc in db:
        content = doc.get("content", "").lower()
        metadata = doc.get("metadata", {})
        
        # Calculate overlap score
        doc_words = set(content.replace(":", " ").replace(".", " ").split())
        intersection = query_words.intersection(doc_words)
        
        score = len(intersection) / len(query_words) if query_words else 0.0
        
        # Boost if the vendor name matches exactly
        vendor_query = metadata.get("vendor", "").lower()
        if vendor_query and vendor_query in query.lower():
            score = min(1.0, score + 0.3)
            
        results.append((doc, score))
        
    # Sort by score descending
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:k]


@tool
def search_incident_history(symptoms: str, vendor_name: str, model_name: str = None, api_key: str = None, base_url: str = None) -> str:
    """
    Searches the persistent local incident history database for matching symptoms
    or known third-party vendor outage patterns. Always call this first before starting scrapers.
    """
    query = f"Vendor: {vendor_name}. Symptoms: {symptoms}"
    logger.info("RAG search query: %s", query)
    
    vector_store, json_path = get_vector_store_and_fallback_path(model_name, api_key, base_url)
    
    if vector_store is not None:
        try:
            results = vector_store.similarity_search_with_relevance_scores(query, k=2)
            if not results or results[0][1] < 0.70:
                return json.dumps({
                    "found": False,
                    "confidence": 0.0,
                    "message": "No relevant historical incidents found. Proceeding to active check."
                })
                
            incidents = []
            for doc, score in results:
                if score >= 0.70:
                    incidents.append({
                        "content": doc.page_content,
                        "metadata": doc.metadata,
                        "score": round(score, 3)
                    })
            return json.dumps({
                "found": len(incidents) > 0,
                "confidence": results[0][1],
                "incidents": incidents
            })
        except Exception as e:
            logger.error("ChromaDB search failed (%s), falling back to JSON search.", e)
            
    # Fallback path
    results = _json_similarity_search(json_path, query, k=2)
    if not results or results[0][1] < 0.50:  # lower threshold for mock keyword scoring
        return json.dumps({
            "found": False,
            "confidence": 0.0,
            "message": "No relevant historical incidents found. Proceeding to active check."
        })
        
    incidents = []
    for doc, score in results:
        if score >= 0.50:
            incidents.append({
                "content": doc["content"],
                "metadata": doc["metadata"],
                "score": round(score, 3)
            })
            
    return json.dumps({
        "found": True,
        "confidence": results[0][1],
        "incidents": incidents
    })


@tool
def store_resolved_incident(
    incident_id: str,
    symptoms: str,
    vendor_name: str,
    root_cause: str,
    resolution: str,
    duration_minutes: int,
    model_name: str = None,
    api_key: str = None,
    base_url: str = None
) -> str:
    """
    Persists resolved incident postmortems directly to the ChromaDB vector database,
    teaching the system the signature of the outage for future runs.
    """
    summary = (
        f"Vendor: {vendor_name}. Symptoms: {symptoms}. "
        f"Root Cause: {root_cause}. Resolution: {resolution}."
    )
    metadata = {
        "incident_id": incident_id,
        "vendor": vendor_name,
        "resolved_at": datetime.now().isoformat(),
        "duration": duration_minutes
    }
    
    logger.info("RAG storing resolved incident: %s", incident_id)
    
    vector_store, json_path = get_vector_store_and_fallback_path(model_name, api_key, base_url)
    
    # Store in JSON database first for robust local persistence
    db = _load_json_db(json_path)
    # Avoid duplicate storage
    if not any(doc.get("metadata", {}).get("incident_id") == incident_id for doc in db):
        db.append({
            "content": summary,
            "metadata": metadata
        })
        _save_json_db(json_path, db)
        
    # Store in ChromaDB if available
    if vector_store is not None:
        try:
            doc = Document(page_content=summary, metadata=metadata)
            vector_store.add_documents([doc])
            if hasattr(vector_store, "persist"):
                vector_store.persist()
            logger.info("Stored in ChromaDB vector database.")
        except Exception as e:
            logger.error("Failed to store in ChromaDB (%s), saved in JSON backup.", e)
            
    return json.dumps({"stored": True, "incident_id": incident_id})
