import os
import base64
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import cv2
import numpy as np
from contextlib import asynccontextmanager
import logging

from src.config import ANPR_SERVICE_PORT
from src.detector import LicensePlateDetector
from src.ocr import EasyOCRWrapper
from src.normalizer import normalize_plate
from src.backend_client import get_client as get_backend_client
from src.stream_processor import start_stream, stop_stream, get_streams

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Module-level singletons — initialized once, shared across requests
detector: Optional[LicensePlateDetector] = None
ocr: Optional[EasyOCRWrapper] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, ocr
    logger.info("Initializing ANPR models...")
    detector = LicensePlateDetector()
    ocr = EasyOCRWrapper()
    ocr.get_reader()  # Eager-load EasyOCR model
    logger.info("ANPR models loaded successfully.")

    # Optionally authenticate with backend
    backend = get_backend_client()
    anpr_email = os.getenv("ANPR_SERVICE_EMAIL", "operator@sentinel.local")
    anpr_pass = os.getenv("ANPR_SERVICE_PASSWORD", "ChangeMe_Operator1!")
    token = await backend.login(anpr_email, anpr_pass)
    if token:
        logger.info("ANPR service authenticated with backend.")
    else:
        logger.warning("ANPR service could not authenticate with backend — detections will fail auth checks.")

    yield

    # Cleanup: stop all active streams
    for cam_id in list(get_streams()):
        stop_stream(cam_id)
    await backend.close()
    logger.info("ANPR service shutdown complete.")


app = FastAPI(
    title="Sentinel ANPR Service",
    description="License plate detection and OCR for the Sentinel CCTV platform",
    version="1.0.0",
    lifespan=lifespan,
)


# --- Pydantic models ---

class StreamRequest(BaseModel):
    camera_id: str
    rtsp_url: str


class FrameBase64Request(BaseModel):
    image_base64: str
    camera_id: Optional[str] = None


class DetectionResponse(BaseModel):
    bbox: List[int]
    plate_text_raw: str
    plate_text_normalized: str
    confidence: float


class StreamInfo(BaseModel):
    camera_id: str
    status: str


# --- Endpoints ---

@app.post("/process-frame", response_model=List[DetectionResponse])
async def process_frame(file: UploadFile = File(...)):
    """Process a single image frame and return all detected plates.
    Accepts multipart file upload (JPEG/PNG)."""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file — could not decode")

    return _detect_plates(frame)


@app.post("/process-frame-base64", response_model=List[DetectionResponse])
async def process_frame_base64(req: FrameBase64Request):
    """Process a base64-encoded image and return detected plates."""
    try:
        image_data = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    nparr = np.frombuffer(image_data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image from base64")

    return _detect_plates(frame)


@app.post("/process-stream")
async def add_stream(req: StreamRequest):
    """Start processing an RTSP stream for a given camera.
    Detections are automatically posted to the backend API."""
    if not req.camera_id or not req.rtsp_url:
        raise HTTPException(status_code=400, detail="camera_id and rtsp_url are required")

    start_stream(req.camera_id, req.rtsp_url)
    return {"status": "started", "camera_id": req.camera_id}


@app.delete("/streams/{camera_id}")
async def remove_stream(camera_id: str):
    """Stop processing an active stream."""
    if camera_id not in get_streams():
        raise HTTPException(status_code=404, detail=f"No active stream for camera {camera_id}")
    stop_stream(camera_id)
    return {"status": "stopped", "camera_id": camera_id}


@app.get("/streams")
async def list_streams():
    """List all actively processing streams."""
    return {"active_streams": get_streams()}


@app.get("/health")
async def health_check():
    """Service health endpoint. Reports model load status."""
    return {
        "status": "up",
        "model_loaded": detector is not None and detector.model is not None,
        "ocr_loaded": ocr is not None and ocr._instance is not None,
        "active_streams": len(get_streams()),
    }


# --- Internal helpers ---

def _detect_plates(frame: np.ndarray) -> List[DetectionResponse]:
    """Run YOLO detection + OCR on a frame. Returns empty list if no plates found."""
    if detector is None:
        raise HTTPException(status_code=503, detail="Detector not initialized")

    detections = detector.detect(frame)
    results = []

    for det in detections:
        raw_text, ocr_conf = ocr.read_text(det.cropped_image)
        if not raw_text:
            # Edge case: no text readable — skip (don't send garbage)
            continue

        norm_text, conf_adj = normalize_plate(raw_text)
        final_confidence = round(det.confidence * ocr_conf * conf_adj, 4)

        results.append(DetectionResponse(
            bbox=det.bbox,
            plate_text_raw=raw_text,
            plate_text_normalized=norm_text,
            confidence=min(final_confidence, 1.0),
        ))

    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=ANPR_SERVICE_PORT, reload=True)
