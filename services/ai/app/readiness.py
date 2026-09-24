"""Free local readiness checks, without pretending to verify provider credits."""
import shutil
from datetime import UTC, datetime

from app.core.config import settings


def readiness() -> dict[str, object]:
    has_key = bool(settings.openai_api_key and settings.openai_api_key.get_secret_value())
    embedding_provider = settings.ai_embedding_provider or settings.ai_text_provider
    text_ready = settings.ai_text_provider == "local" or has_key
    embeddings_ready = (embedding_provider == "local" or has_key) and settings.embedding_dimensions == 1536
    image_ready = settings.ai_image_provider != "openai" or has_key
    motion_ready = shutil.which(settings.video_ffmpeg_path) is not None
    ready = text_ready and embeddings_ready and image_ready and motion_ready
    return {
        "service": "ai",
        "status": "ok" if ready else "degraded",
        "timestamp": datetime.now(UTC).isoformat(),
        "dependencies": {
            "textConfiguration": "ok" if text_ready else "missing_key",
            "embeddingConfiguration": "ok" if embeddings_ready else "invalid_configuration",
            "imageConfiguration": "ok" if image_ready else "missing_key",
            "motionRenderer": "ok" if motion_ready else "missing_ffmpeg",
        },
        "providerConnectivity": "not_checked",
        "providerCredits": "not_checked",
    }
