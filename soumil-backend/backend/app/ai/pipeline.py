"""
DetectionPipeline (+10M Yellow Perimeter ROI & Person Intrusion Alerting)
-------------------------------------------------------------------------
Runs continuously in the background alongside a live CameraWorker.
1. Draws a static high-visibility yellow bracket/polygon representing a +10-meter perimeter.
2. Detects and tracks persons in the live RTSP stream.
3. Detects if any person enters or intersects the +10m perimeter.
4. Triggers tactical intrusion alerts and sends email notifications to the logged-in officer
   with a cooldown timer to prevent notification spamming.
5. Streams real-time annotated JPEG frames directly to the consolidated Node.js /ingest endpoint.
"""

import os
import queue
import threading
import time
import base64
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
import cv2
import numpy as np

from app.ai.tracker import Tracker
from app.analytics.intrusion import Zone, IntrusionDetector
from app.events.event_manager import EventManager


class DetectionPipeline:
    def __init__(self, camera_id: str, camera_worker, event_manager: EventManager, zone: Zone = None,
                 camera_name: str = "Tactical Perimeter Cam",
                 user_id: int = None,
                 user_email: str = "operator@netra-ai.mil",
                 user_name: str = "Tactical Officer",
                 user_rank: str = "Captain",
                 broadcaster_url: str = None,
                 api_alert_url: str = None):
        self.camera_id = camera_id
        self.camera_worker = camera_worker
        self.event_manager = event_manager
        self.camera_name = camera_name
        self.user_id = user_id
        self.user_email = user_email
        self.user_name = user_name
        self.user_rank = user_rank
        node_api_url = os.getenv("NODE_API_URL", "http://localhost:5000").rstrip("/")
        self.broadcaster_url = broadcaster_url or f"{node_api_url}/ingest"
        self.api_alert_url = api_alert_url or f"{node_api_url}/api/alert"

        self.tracker = Tracker()
        # Default static +6m perimeter fence zone (lower screen boundary: 0,450 to 1280,720)
        self.zone = zone or Zone("+6M-FENCE", points=[(0, 450), (1280, 450), (1280, 720), (0, 720)])
        self.intrusion_detector = IntrusionDetector(self.zone)

        self._running = False
        self._thread = None
        self._sender_thread = None
        self._frame_queue = queue.Queue(maxsize=1)
        self._last_db_alert_time = 0

        # Email cooldown timer (45 seconds)
        self.email_cooldown_seconds = 45.0
        self._last_email_time = 0

    def start(self) -> None:
        self._running = True
        self._sender_thread = threading.Thread(target=self._sender_loop, daemon=True)
        self._sender_thread.start()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print(f"[AI Pipeline] Started for camera '{self.camera_name}' (ID: {self.camera_id}). Target: {self.broadcaster_url}")

    def stop(self) -> None:
        """Signal the pipeline and sender thread to terminate cleanly."""
        self._running = False
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        if self._sender_thread is not None and self._sender_thread.is_alive():
            self._sender_thread.join(timeout=1.0)
        print(f"[AI Pipeline] Stopped for camera ID: {self.camera_id}")

    def _enqueue_frame(self, jpeg_bytes: bytes) -> None:
        """Non-blocking queue insert with newest-frame-wins policy (zero latency accumulation)."""
        try:
            self._frame_queue.put_nowait(jpeg_bytes)
        except queue.Full:
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._frame_queue.put_nowait(jpeg_bytes)
            except queue.Full:
                pass

    def _sender_loop(self) -> None:
        """Decoupled transmission thread: posts latest frame to Node.js without blocking AI."""
        session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=2, pool_maxsize=4, max_retries=0)
        session.mount("http://", adapter)
        while self._running:
            try:
                jpeg_data = self._frame_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                session.post(
                    self.broadcaster_url,
                    data=jpeg_data,
                    headers={"Content-Type": "image/jpeg"},
                    timeout=0.5
                )
            except Exception:
                pass

    def _draw_hud(self, frame, tracked_objects, has_intrusion: bool):
        h, w = frame.shape[:2]

        # -------------------------------------------------------------
        # 1. Draw Static +6M Tactical Perimeter Fence (Lower Screen Zone: y=450 to 720)
        # -------------------------------------------------------------
        overlay = frame.copy()
        # High-visibility Tactical Yellow (BGR: 0, 255, 255) when secure; Bright Red (0, 0, 255) when breached
        bracket_color = (0, 0, 255) if has_intrusion else (0, 255, 255)

        # Semi-transparent zone fill across lower screen boundary (Y: 450 to 720)
        fill_alpha = 0.25 if has_intrusion else 0.14
        cv2.fillPoly(overlay, [self.zone._np_points], color=bracket_color)
        cv2.addWeighted(overlay, fill_alpha, frame, 1.0 - fill_alpha, 0, frame)

        # Draw primary tactical horizontal fence line across y=450
        cv2.line(frame, (0, 450), (w, 450), bracket_color, 3)

        # Draw tactical military fence wire / post ticks along the boundary (y=450)
        for x in range(0, w, 40):
            cv2.line(frame, (x, 438), (x, 462), bracket_color, 2)
            cv2.line(frame, (x, 450), (x + 20, 462), bracket_color, 1)

        # Zone Label Badge
        badge_text = "[ +6-METER TACTICAL PERIMETER FENCE ]" if not has_intrusion else "[ ⚠️ INTRUSION DETECTED: +6M FENCE BREACH ]"
        badge_pos = (24, 485)
        (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (badge_pos[0] - 6, badge_pos[1] - th - 6), (badge_pos[0] + tw + 6, badge_pos[1] + 6), (15, 20, 25), -1)
        cv2.rectangle(frame, (badge_pos[0] - 6, badge_pos[1] - th - 6), (badge_pos[0] + tw + 6, badge_pos[1] + 6), bracket_color, 1)
        cv2.putText(frame, badge_text, badge_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.6, bracket_color, 2)

        # -------------------------------------------------------------
        # 2. Draw Tracked Person Bounding Boxes & Badges (Strictly Persons Only)
        # -------------------------------------------------------------
        for obj in tracked_objects:
            class_name = getattr(obj, "class_name", "person").lower()
            if class_name != "person":
                continue

            x1, y1, x2, y2 = [int(v) for v in obj.box]

            is_inside = self.zone.intersects_box(x1, y1, x2, y2)
            box_color = (0, 0, 255) if is_inside else (0, 255, 0) # Red if inside +6m fence, green if safe outside

            # Bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

            # Person label tag
            label = f"ID:{obj.track_id} PERSON {obj.confidence:.2f}"
            if is_inside:
                label += " [INTRUSION]"

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
            cv2.rectangle(frame, (x1, max(0, y1 - 20)), (x1 + lw + 6, max(20, y1)), box_color, -1)
            cv2.putText(frame, label, (x1 + 3, max(14, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 1)

        # -------------------------------------------------------------
        # 3. Tactical Top Telemetry HUD Bar
        # -------------------------------------------------------------
        cv2.rectangle(frame, (0, 0), (w, 36), (10, 14, 22), -1)
        timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"NETRA AI TACTICAL MONITOR | {self.camera_name.upper()} | {timestamp_str}", (16, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 255, 180), 2)

        status_text = "STATUS: +6M FENCE BREACH DETECTED" if has_intrusion else "STATUS: +6M PERIMETER SECURE"
        status_color = (0, 0, 255) if has_intrusion else (0, 255, 0)
        cv2.putText(frame, status_text, (w - 340, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.52, status_color, 2)

        return frame

    def _create_standby_frame(self, w=1280, h=720):
        """Generates a high-fidelity tactical standby HUD frame when waiting for stream frames."""
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame[:] = (16, 12, 8)

        # Subtle tactical grid
        for y in range(0, h, 60):
            cv2.line(frame, (0, y), (w, y), (26, 20, 15), 1)
        for x in range(0, w, 60):
            cv2.line(frame, (x, 0), (x, h), (26, 20, 15), 1)

        # Draw +10M Perimeter polygon outline in tactical yellow
        cv2.polylines(frame, [self.zone._np_points], isClosed=True, color=(0, 255, 255), thickness=1)

        # Tactical Corner Brackets
        c_len = 30
        cv2.line(frame, (20, 56), (20 + c_len, 56), (0, 255, 255), 2)
        cv2.line(frame, (20, 56), (20, 56 + c_len), (0, 255, 255), 2)
        cv2.line(frame, (w - 20, 56), (w - 20 - c_len, 56), (0, 255, 255), 2)
        cv2.line(frame, (w - 20, 56), (w - 20, 56 + c_len), (0, 255, 255), 2)
        cv2.line(frame, (20, h - 20), (20 + c_len, h - 20), (0, 255, 255), 2)
        cv2.line(frame, (20, h - 20), (20, h - 20 - c_len), (0, 255, 255), 2)
        cv2.line(frame, (w - 20, h - 20), (w - 20 - c_len, h - 20), (0, 255, 255), 2)
        cv2.line(frame, (w - 20, h - 20), (w - 20, h - 20 - c_len), (0, 255, 255), 2)

        # Top Header Bar
        cv2.rectangle(frame, (0, 0), (w, 36), (10, 14, 22), -1)
        timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"NETRA AI TACTICAL SURVEILLANCE | {self.camera_name.upper()} | {timestamp_str}",
                    (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 255, 180), 2)
        cv2.putText(frame, "AI PIPELINE: ARMED (+6M FENCE LOWER BOUNDARY)", (w - 440, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 255), 2)

        # Center Status Telemetry Box
        worker_status = getattr(self.camera_worker, "status", "connecting")
        reconnect_count = getattr(self.camera_worker, "reconnect_count", 0)
        source_url = getattr(self.camera_worker, "source", "RTSP Stream")
        last_error = getattr(self.camera_worker, "last_error", "")

        cx, cy = w // 2, h // 2
        box_w, box_h = 820, 230
        bx1, by1 = cx - box_w // 2, cy - box_h // 2
        bx2, by2 = cx + box_w // 2, cy + box_h // 2

        cv2.rectangle(frame, (bx1, by1), (bx2, by2), (12, 18, 28), -1)
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), (0, 180, 255), 2)

        title = "CONNECTING TO RTSP STREAM SOURCE..." if reconnect_count == 0 else f"AWAITING RTSP FEED (RECONNECTING #{reconnect_count})..."
        cv2.putText(frame, title, (bx1 + 24, by1 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (255, 255, 255), 2)

        cv2.putText(frame, f"Stream Source: {source_url}", (bx1 + 24, by1 + 84),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 255, 255), 1)

        status_line = f"Status: {worker_status.upper()} | Protocol: RTSP (Low Delay) | Backend: FFMPEG"
        if last_error:
            status_line += f" ({last_error[:35]}...)"
        cv2.putText(frame, status_line, (bx1 + 24, by1 + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (180, 200, 220), 1)

        cv2.putText(frame, "Assigned Officer: " + str(self.user_rank) + " " + str(self.user_name) + " (" + str(self.user_email) + ")",
                    (bx1 + 24, by1 + 154), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (140, 160, 180), 1)

        subtext = "Note: Ensure phone screen is on & app running. Tip: IP Webcam (http://<ip>:8080/video) or PC Webcam (0) also supported."
        cv2.putText(frame, subtext, (bx1 + 24, by1 + 194),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.36, (100, 220, 120), 1)

        return frame

    def _run_loop(self) -> None:
        cached_tracked_objects = []
        cached_has_intrusion = False
        frame_counter = 0

        while self._running:
            loop_start = time.time()
            raw_frame = self.camera_worker.get_latest_frame()

            if raw_frame is not None:
                # Standardize frame resolution to 1280x720 using fast INTER_LINEAR
                fh, fw = raw_frame.shape[:2]
                if fw != 1280 or fh != 720:
                    frame_copy = cv2.resize(raw_frame, (1280, 720), interpolation=cv2.INTER_LINEAR)
                else:
                    frame_copy = raw_frame.copy()

                frame_counter += 1
                # Inference decimation: Run YOLOv8 on alternate frames
                # Intervening frames reuse tracks for smooth 25-30 FPS display
                if frame_counter % 2 == 1 or len(cached_tracked_objects) == 0:
                    tracked_objects = self.tracker.track(frame_copy)
                    self.intrusion_detector.check(tracked_objects)
                    cached_tracked_objects = tracked_objects
                    cached_has_intrusion = len(self.intrusion_detector._tracks_inside) > 0

                has_intrusion = cached_has_intrusion

                # Process any detected intrusions
                if has_intrusion:
                    now = time.time()

                    # Trigger DB alert (debounce 3s)
                    if now - self._last_db_alert_time > 3.0:
                        self._last_db_alert_time = now
                        track_id = list(self.intrusion_detector._tracks_inside)[0] if self.intrusion_detector._tracks_inside else 1
                        threading.Thread(target=self._post_db_alert, args=(track_id, frame_copy), daemon=True).start()

                    # Trigger Cooldown Email Notification (debounce 45s)
                    if now - self._last_email_time >= self.email_cooldown_seconds:
                        self._last_email_time = now
                        track_id = list(self.intrusion_detector._tracks_inside)[0] if self.intrusion_detector._tracks_inside else 1
                        threading.Thread(target=self._send_intrusion_email, args=(track_id,), daemon=True).start()

                # Render tactical HUD overlay with +6m tactical perimeter fence
                annotated = self._draw_hud(frame_copy, cached_tracked_objects, has_intrusion)

                # Encode JPEG at quality 65 (50% smaller payload, 2x faster decode, lower latency)
                ret, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
                if ret:
                    self._enqueue_frame(buffer.tobytes())

                # Target 30 FPS with precise elapsed-time compensation
                elapsed = time.time() - loop_start
                sleep_time = max(0.001, (1.0 / 30.0) - elapsed)
                time.sleep(sleep_time)
            else:
                # Stream active tactical standby HUD when waiting for camera connection
                standby = self._create_standby_frame()
                ret, buffer = cv2.imencode('.jpg', standby, [cv2.IMWRITE_JPEG_QUALITY, 65])
                if ret:
                    self._enqueue_frame(buffer.tobytes())
                time.sleep(1 / 10)

    def _send_intrusion_email(self, track_id: int) -> None:
        """Sends an email breach notification with cooldown handling."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        subject = f"[NETRA AI ALERT] +6-Meter Tactical Fence Breach Detected - {self.camera_name}"
        body = f"""====================================================
TACTICAL INTRUSION ALERT - NETRA AI PLATFORM
====================================================
Alert Level:    CRITICAL PERIMETER BREACH
Target Camera:  {self.camera_name} ({self.camera_id})
Perimeter Zone: +6-Meter Tactical Fence (Lower Screen Boundary)
Assigned User:  {self.user_rank} {self.user_name}
Target Email:   {self.user_email}
Target Track:   Person (Track ID #{track_id})
Timestamp:      {timestamp}
Status:         ACTIVE BREACH DETECTED
====================================================
A person has entered or crossed the +6-meter
monitored tactical perimeter fence. Immediate tactical perimeter
verification is advised.

Automated Alert generated by Netra AI Computer Vision Engine.
(Cooldown active: next notification suppressed for 45s).
"""
        print(f"\n[EMAIL ALERT DISPATCHED - COOLDOWN ACTIVE (45s)]")
        print(f" To: {self.user_email}")
        print(f" Subject: {subject}")
        print(f" Officer: {self.user_rank} {self.user_name}")

        # Check SMTP configuration from environment
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_pass = os.getenv("SMTP_PASSWORD")
        from_email = os.getenv("ALERT_EMAIL_FROM", smtp_user or "alerts@netra-ai.mil")

        if smtp_host and smtp_user and smtp_pass:
            try:
                msg = MIMEMultipart()
                msg["From"] = from_email
                msg["To"] = self.user_email
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain"))

                if smtp_port == 465:
                    with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as server:
                        server.login(smtp_user, smtp_pass)
                        server.send_message(msg)
                else:
                    with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                        server.ehlo()
                        server.starttls()
                        server.ehlo()
                        server.login(smtp_user, smtp_pass)
                        server.send_message(msg)
                print(f"[Email Notification] Successfully sent real SMTP breach notification to {self.user_email}")
            except Exception as e:
                print(f"[Email Notification Error] SMTP delivery failed to {self.user_email} ({e}).")
        else:
            print(f"[Email Notification Notice] Intrusion occurred for {self.user_email}, but SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) are not configured in .env.")

    def _post_db_alert(self, track_id: int, frame) -> None:
        try:
            thumb = cv2.resize(frame, (320, 180))
            _, buf = cv2.imencode('.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 50])
            b64_snapshot = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode('utf-8')

            res = requests.post(
                self.api_alert_url,
                json={
                    "camera_id": self.camera_id,
                    "user_id": self.user_id or 999999,
                    "object_type": "person",
                    "tracking_id": int(track_id),
                    "confidence": 0.92,
                    "spatial_coordinates": {"zone": "+6m_fence", "camera_name": self.camera_name},
                    "snapshot_data": b64_snapshot
                },
                timeout=2.0
            )
            if res.status_code not in [200, 201]:
                print(f"[Alert DB sync error]: {res.status_code} {res.text}")
            else:
                print(f"[Alert DB sync]: Successfully logged intrusion alert for {self.camera_id} in breach register.")
        except Exception as e:
            print(f"[Alert DB sync error]: {e}")

    def stop(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2)
        print(f"[AI Pipeline] Stopped for camera {self.camera_id}")