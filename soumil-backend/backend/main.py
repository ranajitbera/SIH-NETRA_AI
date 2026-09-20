import os
from pathlib import Path

# Automatically load .env configuration from ranajit-apis, soumil-backend, or workspace root
def _load_env_files():
    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / ".env",
        base_dir.parents[1] / "ranajit-apis" / ".env",
        base_dir.parents[1] / ".env",
    ]
    for env_path in candidates:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("\"'")
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception as e:
                print(f"[Netra AI] Warning reading {env_path}: {e}")

_load_env_files()

# Configure OpenCV FFMPEG RTSP options globally before importing cv2
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;3000000|fflags;nobuffer|flags;low_delay|max_delay;500000|framedrop;1"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.camera_api import router as camera_router

app = FastAPI(title="Netra AI Computer Vision Engine")
node_api_url = os.getenv("NODE_API_URL", "http://localhost:5000").rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(camera_router)


@app.on_event("startup")
def startup_event():
    print("[Netra AI Engine] Computer Vision service initialized with +6M Perimeter ROI and Email Alerting.")


@app.get("/")
def home():
    return {
        "service": "Netra AI Computer Vision Engine",
        "status": "online",
        "ingest_target": f"{node_api_url}/ingest",
        "database_api": f"{node_api_url}/api",
        "roi_perimeter": "+6-Meter Restricted Yellow Bracket",
    }