# MARKOS AI Service

FastAPI service for RAG, provider adapters, prompt assembly, and the eight MARKOS agents.

Local run once Python 3.11 is installed:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```
