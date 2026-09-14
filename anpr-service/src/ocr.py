import easyocr
import numpy as np
from typing import Tuple
import logging

logger = logging.getLogger(__name__)

class EasyOCRWrapper:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EasyOCRWrapper, cls).__new__(cls)
            cls._instance.reader = None
        return cls._instance
        
    def get_reader(self):
        if self.reader is None:
            logger.info("Initializing EasyOCR...")
            self.reader = easyocr.Reader(['en'], gpu=False)
        return self.reader
        
    def read_text(self, image: np.ndarray) -> Tuple[str, float]:
        if image is None or image.size == 0:
            return "", 0.0
            
        reader = self.get_reader()
        try:
            results = reader.readtext(image)
            if not results:
                return "", 0.0
                
            texts = []
            confs = []
            for (bbox, text, prob) in results:
                texts.append(text)
                confs.append(prob)
                
            if not texts:
                return "", 0.0
                
            combined_text = "".join(texts)
            avg_conf = sum(confs) / len(confs)
            
            return combined_text, avg_conf
            
        except Exception as e:
            logger.error(f"OCR Error: {e}")
            return "", 0.0
