import os

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:4000")
ANPR_SERVICE_PORT = int(os.getenv("ANPR_SERVICE_PORT", "5000"))
FRAME_SKIP = int(os.getenv("FRAME_SKIP", "5"))
MODEL_PATH = os.getenv("MODEL_PATH", "models/best.pt")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))

# Auth credentials for backend API (ANPR logs in as operator or a dedicated service account)
ANPR_SERVICE_EMAIL = os.getenv("ANPR_SERVICE_EMAIL", "operator@sentinel.local")
ANPR_SERVICE_PASSWORD = os.getenv("ANPR_SERVICE_PASSWORD", "ChangeMe_Operator1!")
