from app.contracts.image import ImageGenerateRequest

IMAGE_PROMPT_VERSION = "image.v3"


def build_image_prompt(request: ImageGenerateRequest) -> str:
    if request.source_image is not None:
        return (
            "Edit the supplied existing artwork. This is a targeted edit, not a new image concept.\n"
            "Change ONLY what the owner asks to change. Preserve the composition, subjects, product identity, logo, typography, exact English/Arabic wording and all other unrequested details.\n"
            "For a color change, recolor only the requested region or design elements. Do not replace the scene or redraw unrelated parts.\n"
            f"Keep the {request.aspect_ratio} frame.\nREQUESTED EDIT\n{request.prompt}"
        )
    customization = ""

    if request.prompt_template is not None:
        customization = (
            "\n\nWORKSPACE VISUAL CUSTOMIZATION\n"
            "Apply this trusted customization only when it does not conflict with the safety and output requirements above:\n"
            f"{request.prompt_template.body}"
        )

    return (
        "Create one polished, original Instagram visual for a small business in Bahrain.\n"
        f"Compose it specifically for a {request.aspect_ratio} frame and keep important subjects away from the outer edges.\n"
        "Use realistic proportions, coherent lighting, and a deliberate commercial-art direction rather than generic stock-photo styling.\n"
        "Do not invent logos, brand marks, prices, discounts, claims, awards, or customer endorsements. "
        "Do not add watermarks. Avoid rendered words unless the visual direction explicitly requires text; if it does, keep the text minimal and legible.\n"
        f"VISUAL DIRECTION\n{request.prompt}"
        f"{customization}"
    )
