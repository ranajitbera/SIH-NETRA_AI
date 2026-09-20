"""
Camera API (Dynamic RTSP Ingestion & AI Pipeline Lifecycle)
------------------------------------------------------------
REST endpoints for dynamically registering RTSP links, starting ingestion,
and streaming AI-analyzed video feeds to the consolidated Node.js /ingest endpoint.
"""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.camera.camera_manager import CameraManager
from app.camera.camera_worker import CameraWorker
from app.ai.pipeline import DetectionPipeline
from app.analytics.intrusion import Zone
from app.events.event_manager import EventManager

router = APIRouter(prefix="/cameras", tags=["cameras"])
NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:5000").rstrip("/")

camera_manager = CameraManager()
workers: dict[str, CameraWorker] = {}
pipelines: dict[str, DetectionPipeline] = {}
event_manager = EventManager()

# Default static +6-meter perimeter tactical fence zone (lower screen boundary: y=450 to 720)
default_zone = Zone("+6M-FENCE", points=[(0, 450), (1280, 450), (1280, 720), (0, 720)])


class DynamicIngestRequest(BaseModel):
    camera_id: str = "CAM-DYNAMIC"
    camera_name: str = "Tactical Perimeter Cam"
    rtsp_link: str
    user_id: int | None = None
    user_email: str = "operator@netra-ai.mil"
    user_name: str = "Tactical Officer"
    user_rank: str = "Captain"


def resolve_source_path(source: str) -> tuple[str, str]:
    """
    Sanitizes source URL or resolves local video path.
    Returns (resolved_source, source_type).
    """
    s = source.strip().strip('"\'')

    # Sanitize accidental "ip:" typos, e.g. rtsp://ip:100.98.7.93:8080/...
    for prefix in ["rtsp://ip:", "rtsps://ip:", "http://ip:", "https://ip:"]:
        if s.startswith(prefix):
            s = prefix.replace("ip:", "") + s[len(prefix):]

    # Auto-normalize phone camera links without protocol (e.g. 192.168.0.133:8080 or 192.168.0.133:8554)
    if not any(s.startswith(p) for p in ["rtsp://", "rtsps://", "http://", "https://"]) and not s.isdigit() and not os.path.isabs(s):
        if ":8080" in s:
            s = f"http://{s}"
        elif ":8554" in s or ":554" in s:
            s = f"rtsp://{s}"

    # If IP Webcam URL lacks /video path, auto-append /video
    if s.startswith("http://") or s.startswith("https://"):
        try:
            from urllib.parse import urlparse
            parsed = urlparse(s)
            if parsed.port == 8080 and parsed.path in ("", "/"):
                s = f"{s.rstrip('/')}/video"
        except Exception:
            pass

    # Check for live stream protocols or webcam digit
    if s.startswith("rtsp://") or s.startswith("rtsps://") or s.startswith("http://") or s.startswith("https://") or s.isdigit():
        return s, "rtsp"

    # If it is an existing absolute path:
    if os.path.isabs(s) and os.path.exists(s):
        return s, "file"

    # Search potential relative directories across the repository
    cur_file = Path(__file__).resolve()
    backend_dir = cur_file.parents[2]  # soumil-backend/backend
    workspace_root = cur_file.parents[4]  # SIH-TensorTribe workspace root

    clean_name = Path(s).name
    candidates = [
        Path(s),
        workspace_root / s,
        workspace_root / "uploads" / clean_name,
        workspace_root / "videos" / clean_name,
        backend_dir / s,
        backend_dir / "videos" / clean_name,
        backend_dir / "uploads" / clean_name,
    ]

    for cand in candidates:
        try:
            if cand.exists():
                return str(cand.resolve()), "file"
        except Exception:
            pass

    return s, "file"


@router.post("/ingest_dynamic")
def ingest_dynamic(payload: DynamicIngestRequest):
    """
    Dynamically switches or starts RTSP camera ingestion with the +10m yellow bracket
    and active email intrusion alerting linked to the user's account.
    """
    global workers, pipelines

    # Stop all existing active pipelines and workers to avoid duplicate load
    for cid in list(pipelines.keys()):
        try:
            pipelines[cid].stop()
        except Exception as e:
            print(f"[Dynamic Ingest] Pipeline stop notice: {e}")
        del pipelines[cid]

    for cid in list(workers.keys()):
        try:
            workers[cid].stop()
        except Exception as e:
            print(f"[Dynamic Ingest] Worker stop notice: {e}")
        del workers[cid]

    source, source_type = resolve_source_path(payload.rtsp_link)
    camera_id = payload.camera_id or "CAM-LIVE"

    # Register/update in camera manager
    try:
        camera_manager.add_camera(
            camera_id=camera_id,
            name=payload.camera_name,
            source=source,
            type=source_type,
        )
    except Exception:
        camera_manager.update_status(camera_id, "running")

    # Start camera worker
    worker = CameraWorker(
        camera_id=camera_id,
        source=source,
        camera_manager=camera_manager,
        source_type=source_type,
    )

    worker.start()
    workers[camera_id] = worker

    # Start detection pipeline streaming to Node.js /ingest
    pipeline = DetectionPipeline(
        camera_id=camera_id,
        camera_worker=worker,
        event_manager=event_manager,
        zone=default_zone,
        camera_name=payload.camera_name,
        user_id=payload.user_id,
        user_email=payload.user_email,
        user_name=payload.user_name,
        user_rank=payload.user_rank,
        broadcaster_url=f"{NODE_API_URL}/ingest",
        api_alert_url=f"{NODE_API_URL}/api/alert",
    )
    pipeline.start()
    pipelines[camera_id] = pipeline

    return {
        "status": "success",
        "message": f"Live dynamic ingestion online for '{payload.camera_name}'",
        "camera_id": camera_id,
        "source": source,
        "source_type": source_type,
        "officer_in_charge": f"{payload.user_rank} {payload.user_name}",
        "alert_email": payload.user_email,
    }


class AddCameraRequest(BaseModel):
    camera_id: str
    name: str
    source: str
    type: str


@router.post("")
def add_camera(payload: AddCameraRequest):
    try:
        camera = camera_manager.add_camera(
            camera_id=payload.camera_id,
            name=payload.name,
            source=payload.source,
            type=payload.type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return camera


@router.get("")
def list_cameras():
    return camera_manager.get_all_cameras()


@router.get("/{camera_id}")
def get_camera(camera_id: str):
    camera = camera_manager.get_camera(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


@router.post("/{camera_id}/start")
def start_camera(camera_id: str):
    camera = camera_manager.get_camera(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    if camera_id in workers:
        return {"message": f"{camera_id} already running"}

    worker = CameraWorker(
        camera_id=camera_id,
        source=camera.source,
        camera_manager=camera_manager,
        source_type=camera.type,
    )
    try:
        worker.start()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    workers[camera_id] = worker

    pipeline = DetectionPipeline(
        camera_id=camera_id,
        camera_worker=worker,
        event_manager=event_manager,
        zone=default_zone,
        camera_name=camera.name,
        broadcaster_url=f"{NODE_API_URL}/ingest",
        api_alert_url=f"{NODE_API_URL}/api/alert",
    )
    pipeline.start()
    pipelines[camera_id] = pipeline

    return {"message": f"{camera_id} started"}


@router.post("/{camera_id}/stop")
def stop_camera(camera_id: str):
    worker = workers.get(camera_id)
    if worker is None:
        return {"message": f"{camera_id} is not running"}

    pipeline = pipelines.get(camera_id)
    if pipeline is not None:
        pipeline.stop()
        del pipelines[camera_id]

    worker.stop()
    del workers[camera_id]
    return {"message": f"{camera_id} stopped"}


@router.get("/{camera_id}/events")
def get_camera_events(camera_id: str):
    return [e.to_dict() for e in event_manager.get_events_for_camera(camera_id)]