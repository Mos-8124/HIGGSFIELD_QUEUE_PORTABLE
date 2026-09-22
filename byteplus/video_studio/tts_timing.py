#!/usr/bin/env python
"""Edge TTS với word-level timing (SRS §10 — phụ đề đồng bộ từng chữ theo giọng đọc).

Synthesize MỘT lần bằng edge-tts (boundary='WordBoundary') để vừa ghi file media
vừa thu mốc thời gian TỪNG TỪ. In JSON ra stdout:

    {"ok": true, "words": [{"t": "Stop", "off": 0.10, "dur": 0.35}, ...]}

off/dur tính bằng GIÂY, ở tốc độ voice 1.0x (chưa tính adelay/atempo trong FFmpeg).
Miễn phí, chạy local (Microsoft Edge TTS) — không phải paid provider.
"""
import argparse
import asyncio
import json
import os
import sys

import edge_tts

# Windows console mặc định cp1252 → ép UTF-8 để in được tiếng Việt/Unicode ra stdout.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 — môi trường cũ không có reconfigure
    pass


async def _once(text, voice, rate, pitch, out_media):
    """Một lần gọi Edge TTS. Trả list word-timing; ném lỗi nếu dịch vụ không trả audio."""
    communicate = edge_tts.Communicate(
        text, voice, rate=rate, pitch=pitch, boundary="WordBoundary"
    )
    words = []
    audio_bytes = 0
    with open(out_media, "wb") as fh:
        async for chunk in communicate.stream():
            ctype = chunk.get("type")
            if ctype == "audio":
                data = chunk["data"]
                audio_bytes += len(data)
                fh.write(data)
            elif ctype == "WordBoundary":
                words.append(
                    {
                        "t": chunk.get("text", ""),
                        # offset/duration ở đơn vị 100 nano-giây → giây
                        "off": round(chunk.get("offset", 0) / 1e7, 3),
                        "dur": round(chunk.get("duration", 0) / 1e7, 3),
                    }
                )
    if audio_bytes == 0:
        raise RuntimeError("No audio was received")
    return words


async def _run(text, voice, rate, pitch, out_media, attempts, delay):
    """Dịch vụ Edge TTS rớt ngẫu nhiên (đo thật 2026-09-18: 62-67% lần gọi trả rỗng).

    Thử lại NGAY TRONG tiến trình này — mỗi lần là một kết nối WebSocket mới — để khỏi
    tốn ~1s khởi động lại Python cho mỗi lượt. Backoff tăng dần + jitter theo số lượt.
    """
    last = None
    for i in range(max(1, attempts)):
        try:
            return await _once(text, voice, rate, pitch, out_media), i + 1
        except Exception as exc:  # noqa: BLE001 — thử lại mọi lỗi tạm thời của dịch vụ
            last = exc
            try:
                os.remove(out_media)
            except OSError:
                pass
            if i < attempts - 1:
                wait = min(4.0, delay * (1.7 ** i)) * (0.7 + 0.6 * ((i * 37 % 100) / 100.0))
                await asyncio.sleep(wait)
    raise last if last else RuntimeError("TTS thất bại")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--voice", default="vi-VN-HoaiMyNeural")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--out", required=True, help="đường dẫn file media (.mp3)")
    ap.add_argument("--attempts", type=int, default=int(os.environ.get("V2V_TTS_PY_ATTEMPTS", "8")))
    ap.add_argument("--delay", type=float, default=0.6)
    args = ap.parse_args()

    try:
        words, tries = asyncio.run(
            _run(args.text, args.voice, args.rate, args.pitch, args.out,
                 args.attempts, args.delay)
        )
        print(json.dumps({"ok": True, "words": words, "tries": tries}, ensure_ascii=True))
    except Exception as exc:  # noqa: BLE001 — báo lỗi rõ ràng ra stdout cho Node đọc
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=True))
        sys.exit(1)


if __name__ == "__main__":
    main()
