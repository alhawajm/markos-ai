from app.contracts.video import VideoStartRequest

VIDEO_PROMPT_VERSION = "video.v1"


def build_video_prompt(request: VideoStartRequest) -> str:
    return (
        "Create a polished, vertical social-media video for an Instagram Reel or Story. "
        "Use a 9:16 portrait composition, keep important subjects away from interface-safe "
        "areas, avoid logos and readable text unless explicitly requested, and do not invent "
        "claims about the business. Visual direction: "
        f"{request.prompt.strip()}"
    )
