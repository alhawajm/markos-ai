from app.contracts.video import VideoStartRequest

VIDEO_PROMPT_VERSION = "video.v2"


def build_video_prompt(request: VideoStartRequest) -> str:
    return (
        "Create a polished, vertical social-media video for an Instagram Reel or Story. "
        "Use a 9:16 portrait composition, keep important subjects away from interface-safe "
        "areas. Generate visual footage only: no lettering, captions, subtitles, words, "
        "numbers, signage, logos or typography in any language. MARKOS adds requested text "
        "afterwards with real fonts. Leave clear space in the lower middle for those titles. "
        "Do not invent "
        "claims about the business. Visual direction: "
        f"{request.prompt.strip()}"
    )
