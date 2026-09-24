import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.contracts.video import VideoRenderPlan, VideoStartRequest, VideoTextCue
from app.providers import video_plan
from app.providers.openai_structured import StructuredResult
from app.video_text import ass_text, build_subtitles, render_video_text


def plan() -> VideoRenderPlan:
    return VideoRenderPlan(visual_prompt="Pink flowers blooming without lettering", text_cues=[
        VideoTextCue(text="6–7 October\n6 و7 أكتوبر", start=0.25, end=0.75),
        VideoTextCue(text="Save the dates\nاحفظوا الموعد", start=0.75, end=1),
    ])


def test_cues_preserve_unicode_and_timing() -> None:
    result = build_subtitles(plan(), 8)
    assert "0:00:02.00,0:00:06.00" in result
    assert "6–7 October\\N\u202b6 و7 أكتوبر\u202c" in result
    assert "Save the dates\\N\u202bاحفظوا الموعد\u202c" in result
    assert "{\\pos" not in ass_text("{\\pos(1,2)}hello")


@pytest.mark.parametrize("cues", [
    [{"text": "Test", "start": 0.75, "end": 0.5}],
    [{"text": "One", "start": 0, "end": 0.75}, {"text": "Two", "start": 0.5, "end": 1}],
    [{"text": " ", "start": 0, "end": 1}],
])
def test_invalid_layouts_are_rejected(cues: list[dict[str, object]]) -> None:
    with pytest.raises(ValidationError):
        VideoRenderPlan.model_validate({"visual_prompt": "Flower", "text_cues": cues})


def test_no_copy_preserves_original_video() -> None:
    video = b"original bytes"
    assert asyncio.run(render_video_text(video, VideoRenderPlan(
        visual_prompt="Flower", text_cues=[]), 8)) is video


def test_planning_returns_metered_copy(monkeypatch: pytest.MonkeyPatch) -> None:
    async def generate(**kwargs: object) -> StructuredResult[VideoRenderPlan]:
        assert kwargs["model"] == "configured-planner"
        return StructuredResult(content=plan(), model="configured-planner", tokens_in=100, tokens_out=60)

    monkeypatch.setattr(video_plan, "generate_structured", generate)
    response = asyncio.run(video_plan.prepare_video(VideoStartRequest(
        workspace_id="workspace", prompt="Requested bilingual copy", model="configured-planner"
    ), client=SimpleNamespace()))
    assert response.result == plan()
    assert (response.tokens_in, response.tokens_out) == (100, 60)


def test_renderer_preserves_audio_mapping_and_kills_on_cancel(monkeypatch: pytest.MonkeyPatch) -> None:
    # The real ffmpeg/Arabic rendering is additionally exercised on a saved MP4.
    class Process:
        returncode: int | None = None
        calls = 0
        killed = False

        async def communicate(self) -> tuple[bytes, bytes]:
            self.calls += 1
            if self.calls == 1:
                raise asyncio.CancelledError()
            return b"", b""

        def kill(self) -> None:
            self.killed = True
            self.returncode = -9

    process = Process()

    async def spawn(*args: str, **kwargs: object) -> Process:
        assert "0:a?" in args
        assert "ass=titles.ass:shaping=complex" in args
        assert (Path(str(kwargs["cwd"])) / "titles.ass").is_file()
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(render_video_text(b"video", plan(), 8))
    assert process.killed
