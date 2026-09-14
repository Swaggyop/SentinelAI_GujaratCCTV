import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

import asyncio
import cv2
import logging
from datetime import datetime, timezone, timedelta
import uuid
from typing import Dict, List, Optional

from src.config import FRAME_SKIP
from src.normalizer import normalize_plate
from src.backend_client import post_detection, post_heartbeat

logger = logging.getLogger(__name__)

# Active stream tasks keyed by camera_id
_active_streams: Dict[str, asyncio.Task] = {}

# IST timezone
_TZ_IST = timezone(timedelta(hours=5, minutes=30))


async def process_stream_task(camera_id: str, rtsp_url: str):
    """Main stream processing loop with auto-reconnect, RTSP/TCP, and PTS timing."""
    # Lazy import to avoid circular dependency — detector/ocr are initialized in main.py lifespan
    from src.main import detector, ocr

    logger.info(f"[{camera_id}] Starting stream processing: {rtsp_url}")
    backoff = 1
    max_backoff = 60

    while camera_id in _active_streams:
        cap = None
        try:
            # Force RTSP over TCP using CAP_FFMPEG backend
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                raise ConnectionError(f"Failed to open RTSP stream: {rtsp_url}")

            stream_start_time = datetime.now(_TZ_IST)
            logger.info(f"[{camera_id}] Connected to stream over TCP")
            backoff = 1  # Reset on successful connect

            # Report healthy
            await post_heartbeat({
                "camera_id": camera_id,
                "status": "ok",
                "detail": "connected"
            })

            frame_count = 0
            last_heartbeat = datetime.now()

            while cap.isOpened():
                # Check if stream was cancelled
                if camera_id not in _active_streams:
                    logger.info(f"[{camera_id}] Stream task cancelled")
                    break

                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"[{camera_id}] Stream EOF or disconnected")
                    break

                frame_count += 1

                # --- Periodic heartbeat (every 30s) ---
                now = datetime.now()
                if (now - last_heartbeat).total_seconds() >= 30:
                    await post_heartbeat({
                        "camera_id": camera_id,
                        "status": "ok",
                        "detail": f"processing, frame {frame_count}"
                    })
                    last_heartbeat = now

                # --- Frame sampling: skip frames to match inference speed ---
                if frame_count % FRAME_SKIP != 0:
                    await asyncio.sleep(0)  # Yield control
                    continue

                # --- Detection pipeline ---
                if detector is None or ocr is None:
                    logger.warning(f"[{camera_id}] Models not initialized yet, skipping frame")
                    await asyncio.sleep(1)
                    continue

                detections = detector.detect(frame)

                pts_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if stream_start_time and pts_ms > 0:
                    timestamp_now = stream_start_time + timedelta(milliseconds=pts_ms)
                else:
                    timestamp_now = datetime.now(_TZ_IST)

                timestamp_iso = timestamp_now.isoformat()
                date_str = timestamp_now.strftime('%Y-%m-%d')

                for det in detections:
                    raw_text, ocr_conf = ocr.read_text(det.cropped_image)
                    if not raw_text:
                        # Edge case: no readable text — don't send garbage
                        continue

                    norm_text, conf_adj = normalize_plate(raw_text)
                    final_conf = round(det.confidence * ocr_conf * conf_adj, 4)
                    final_conf = min(final_conf, 1.0)

                    # Idempotency key: camera:timestamp:plate (lowercased)
                    idempotency_key = f"{camera_id}:{timestamp_iso}:{norm_text}".lower()

                    # Frame reference for MinIO storage
                    frame_id = str(uuid.uuid4())
                    frame_ref = f"frames/{camera_id}/{date_str}/{frame_id}.jpg"

                    payload = {
                        "idempotency_key": idempotency_key,
                        "camera_id": camera_id,
                        "timestamp": timestamp_iso,
                        "plate_text_raw": raw_text,
                        "plate_text_normalized": norm_text,
                        "confidence": final_conf,
                        "frame_ref": frame_ref,
                    }

                    # Fire and don't await — let the detection post happen in background
                    asyncio.create_task(post_detection(payload))

                # Small sleep to prevent busy-waiting
                await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            logger.info(f"[{camera_id}] Stream task cancelled via CancelledError")
            break
        except Exception as e:
            logger.error(f"[{camera_id}] Stream error: {e}")
        finally:
            if cap is not None and cap.isOpened():
                cap.release()

        # Only reconnect if stream is still active
        if camera_id not in _active_streams:
            break

        # Report stream down
        await post_heartbeat({
            "camera_id": camera_id,
            "status": "down",
            "detail": f"stream disconnected, reconnecting in {backoff}s"
        })

        logger.info(f"[{camera_id}] Reconnecting in {backoff}s...")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, max_backoff)

    logger.info(f"[{camera_id}] Stream processing ended")


def start_stream(camera_id: str, rtsp_url: str):
    """Start processing an RTSP stream for a camera. Stops existing stream if any."""
    if camera_id in _active_streams:
        stop_stream(camera_id)

    task = asyncio.create_task(process_stream_task(camera_id, rtsp_url))
    _active_streams[camera_id] = task
    logger.info(f"[{camera_id}] Stream task created")


def stop_stream(camera_id: str):
    """Stop processing a stream and clean up."""
    if camera_id in _active_streams:
        task = _active_streams.pop(camera_id)
        task.cancel()
        logger.info(f"[{camera_id}] Stream task stopped")


def get_streams() -> List[str]:
    """Return list of active camera IDs being processed."""
    return list(_active_streams.keys())
