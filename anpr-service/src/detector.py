import os
import numpy as np
from typing import List
from pydantic import BaseModel
from ultralytics import YOLO
import logging
from src.config import MODEL_PATH, CONFIDENCE_THRESHOLD

logger = logging.getLogger(__name__)

class DetectionResult(BaseModel):
    bbox: List[int]
    confidence: float
    cropped_image: np.ndarray

    class Config:
        arbitrary_types_allowed = True

class LicensePlateDetector:
    def __init__(self):
        try:
            if os.path.exists(MODEL_PATH):
                self.model = YOLO(MODEL_PATH)
            else:
                logger.warning(f"Model path {MODEL_PATH} not found, falling back to yolov8n.pt")
                self.model = YOLO('yolov8n.pt')
        except Exception as e:
            logger.error(f"Error loading YOLO model: {e}")
            raise

    def detect(self, frame: np.ndarray) -> List[DetectionResult]:
        if frame is None or frame.size == 0:
            return []
            
        results = self.model(frame, verbose=False)
        detections = []
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                conf = float(box.conf[0])
                if conf < CONFIDENCE_THRESHOLD:
                    continue
                    
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                h, w = frame.shape[:2]
                y1 = max(0, y1)
                y2 = min(h, y2)
                x1 = max(0, x1)
                x2 = min(w, x2)
                
                if y2 <= y1 or x2 <= x1:
                    continue
                    
                cropped_img = frame[y1:y2, x1:x2]
                
                detections.append(DetectionResult(
                    bbox=[x1, y1, x2, y2],
                    confidence=conf,
                    cropped_image=cropped_img
                ))
                
        return detections
