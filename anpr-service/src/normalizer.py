import re
from typing import Tuple

STATE_CODES = {
    "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ",
    "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN",
    "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK", "TN", "TR", "TS",
    "UK", "UP", "WB", "OR"
}

NUMERIC_SUBSTITUTIONS = {
    'O': '0', 'Q': '0', 'D': '0',
    'I': '1', 'L': '1',
    'Z': '2',
    'S': '5',
    'G': '6',
    'B': '8'
}

ALPHA_SUBSTITUTIONS = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '8': 'B'
}

def normalize_plate(raw_text: str) -> Tuple[str, float]:
    """
    Normalizes the raw Indian license plate text and adjusts confidence.
    Returns (normalized_text, confidence_adjustment)
    """
    if not raw_text:
        return "", 1.0

    cleaned = re.sub(r'[^a-zA-Z0-9]', '', raw_text).upper()
    
    if len(cleaned) < 4:
        return cleaned, 0.5
        
    confidence_adj = 1.0
    normalized = []
    
    for i in range(min(2, len(cleaned))):
        c = cleaned[i]
        if c in ALPHA_SUBSTITUTIONS:
            normalized.append(ALPHA_SUBSTITUTIONS[c])
            confidence_adj *= 0.9
        else:
            normalized.append(c)
            
    prefix = "".join(normalized[:2])
    if prefix not in STATE_CODES:
        confidence_adj *= 0.7
        
    for i in range(2, len(cleaned)):
        c = cleaned[i]
        distance_from_end = len(cleaned) - i
        if distance_from_end <= 4:
            if c in NUMERIC_SUBSTITUTIONS:
                normalized.append(NUMERIC_SUBSTITUTIONS[c])
                confidence_adj *= 0.9
            else:
                normalized.append(c)
        else:
            normalized.append(c)
            
    final_text = "".join(normalized)
    
    if not re.match(r'^[A-Z0-9]{4,12}$', final_text):
        return final_text, 0.5
        
    return final_text, confidence_adj
