import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import Register from "./pages/register";
import Login from "./pages/login";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Netra AI ErrorBoundary caught error]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0c121e",
            color: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🛡️</div>
          <h2
            style={{ fontSize: "22px", color: "#f87171", marginBottom: "8px" }}
          >
            Tactical Command Center Recovery
          </h2>
          <p
            style={{
              color: "#94a3b8",
              maxWidth: "520px",
              marginBottom: "20px",
              fontSize: "14px",
              lineHeight: "1.6",
            }}
          >
            A rendering anomaly was safely intercepted. Surveillance state and
            backend telemetry remain active.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              padding: "10px 24px",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ⚡ Recover & Reload Command Center
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [page, setPage] = useState("login");
  const [loggedIn, setLoggedIn] = useState(false);

  // User profile with military rank and authentication state
  const [userProfile, setUserProfile] = useState({
    id: null,
    fullname: "Major General Vikram Singh",
    email: "demo.operator@netra-ai.mil",
    rank: "Major General",
    isDemo: false,
  });

  // Real-time WebSocket Video Streaming
  const [liveFrame, setLiveFrame] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const wsRef = useRef(null);
  const liveFrameUrlRef = useRef(null);

  // Dynamic Backend Data
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const activeCameraIdRef = useRef(null);
  const [alertFilter, setAlertFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [militaryTime, setMilitaryTime] = useState("");

  // Add Camera Modal
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [ingestMode, setIngestMode] = useState("video"); // "video" | "stream"
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const fileInputRef = useRef(null);
  const [newCameraName, setNewCameraName] = useState("");
  const [newRtspLink, setNewRtspLink] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [addCamLoading, setAddCamLoading] = useState(false);
  const [addCamError, setAddCamError] = useState("");

  const apiBase =
    import.meta.env.VITE_API_URL ||
    (window.location.port === "5173" ? "http://localhost:5000" : "");

  // Live Military Clock (Zulu + Local)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const zulu = now.toISOString().substring(11, 19) + "Z";
      const local = now.toLocaleTimeString();
      setMilitaryTime(`${local} (ZULU: ${zulu})`);
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // WebSocket Connection to Consolidated Broadcaster (/stream on port 5000)
  useEffect(() => {
    let active = true;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        setWsStatus("connecting");
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsBase =
          import.meta.env.VITE_WS_URL ||
          (window.location.port === "5173"
            ? `${protocol}//localhost:5000`
            : `${protocol}//${window.location.host}`);
        const wsUrl = `${wsBase.replace(/\/$/, "")}/stream`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = "blob";
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) return;
          console.log(
            "[Netra AI WebSocket] Connected to tactical video stream on",
            wsUrl,
          );
          setWsStatus("connected");
        };

        let pendingBlob = null;
        let rafId = null;

        const renderLatestFrame = () => {
          if (pendingBlob) {
            const url = URL.createObjectURL(pendingBlob);
            const previousUrl = liveFrameUrlRef.current;
            liveFrameUrlRef.current = url;
            setLiveFrame(url);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            pendingBlob = null;
          }
          rafId = null;
        };

        ws.onmessage = (event) => {
          if (!active) return;
          if (event.data instanceof Blob) {
            pendingBlob = event.data;
            if (!rafId) {
              rafId = requestAnimationFrame(renderLatestFrame);
            }

            // FPS Calculation
            frameCountRef.current += 1;
            const now = Date.now();
            if (now - lastTimeRef.current >= 1000) {
              setFps(frameCountRef.current);
              frameCountRef.current = 0;
              lastTimeRef.current = now;
            }
          }
        };

        ws.onclose = () => {
          if (!active) return;
          setWsStatus("disconnected");
          reconnectTimeout = setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
          console.warn("[Netra AI WebSocket] Error:", err);
          ws.close();
        };
      } catch (e) {
        console.error("Failed to connect WS:", e);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const hasInitialActivatedRef = useRef(false);

  // Dynamic camera activation / switching
  const handleSelectCamera = async (cam) => {
    if (!cam) return;
    setActiveCameraId(cam.id);
    activeCameraIdRef.current = cam.id;
    const headers = { "Content-Type": "application/json" };
    if (userProfile.isDemo) headers["x-demo-user"] = "true";
    if (userProfile.id) headers["x-user-id"] = userProfile.id.toString();
    if (userProfile.email) headers["x-user-email"] = userProfile.email;
    if (userProfile.fullname) headers["x-user-name"] = userProfile.fullname;
    if (userProfile.rank) headers["x-user-rank"] = userProfile.rank;

    try {
      await fetch(`${apiBase}/api/camera/${cam.id}/activate`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      fetchBackendData();
    } catch (e) {
      console.warn("Camera activation warning:", e);
    }
  };

  // Fetch Cameras & Alerts from PostgreSQL API
  const fetchBackendData = async () => {
    if (!loggedIn) return;
    if (!userProfile.isDemo && !userProfile.id) return;
    setSyncing(true);

    const headers = {};
    if (userProfile.isDemo) {
      headers["x-demo-user"] = "true";
    }
    if (userProfile.id) {
      headers["x-user-id"] = userProfile.id.toString();
    }

    let userCams = [];
    // Fetch Cameras linked to logged-in user
    try {
      const camRes = await fetch(`${apiBase}/api/camera`, {
        headers,
        credentials: "include",
      });
      if (camRes.ok) {
        const data = await camRes.json();
        userCams = data.cameras || [];
        setCameras(userCams);

        if (userCams.length > 0) {
          const activeCam = userCams.find((c) => c.isActive) || userCams[0];
          const currentCamera = userCams.find(
            (c) => c.id === activeCameraIdRef.current,
          );
          const shouldFollowBackendCamera =
            !currentCamera ||
            (!currentCamera.isActive && activeCam.id !== currentCamera.id);

          if (shouldFollowBackendCamera) {
            setActiveCameraId(activeCam.id);
            activeCameraIdRef.current = activeCam.id;
          }
          if (!hasInitialActivatedRef.current) {
            hasInitialActivatedRef.current = true;
            handleSelectCamera(activeCam);
          }
        } else {
          setActiveCameraId(null);
          activeCameraIdRef.current = null;
        }
      }
    } catch (err) {
      console.warn("Camera fetch warning:", err);
    }

    // Fetch Alerts isolated specifically to cameras currently in userCams
    try {
      if (userCams.length === 0) {
        // If no cameras are linked to this account, no alerts exist
        setAlerts([]);
      } else {
        const alertRes = await fetch(`${apiBase}/api/alert`, {
          headers,
          credentials: "include",
        });
        if (alertRes.ok) {
          const data = await alertRes.json();
          if (data.alerts && Array.isArray(data.alerts)) {
            // Strictly match cameras currently monitored/linked to this account
            const validCamIds = new Set(
              userCams.flatMap((c) => [
                c.id.toString(),
                `CAM-${c.id}`.toUpperCase(),
                (c.cameraName || "").toLowerCase().trim(),
              ]),
            );
            const userOnlyAlerts = data.alerts.filter((a) => {
              if (!a.camera_id) return false;
              const cid = a.camera_id.toString().trim();
              const cidUpper = cid.toUpperCase();
              const cidNum = cid.replace(/^CAM-/i, "").trim();
              const spatialName = (a.spatial_coordinates?.camera_name || "")
                .toLowerCase()
                .trim();
              return (
                validCamIds.has(cid) ||
                validCamIds.has(cidUpper) ||
                validCamIds.has(cidNum) ||
                (spatialName && validCamIds.has(spatialName))
              );
            });
            setAlerts(userOnlyAlerts);
          }
        }
      }
    } catch (err) {
      console.warn("Alert fetch warning:", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (loggedIn && (userProfile.id || userProfile.isDemo)) {
      fetchBackendData();
      const interval = setInterval(fetchBackendData, 4000);
      return () => clearInterval(interval);
    }
  }, [loggedIn, userProfile.id, userProfile.isDemo]);

  // Handle Escape key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowAddCameraModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle Video File Upload Ingestion
  const handleUploadVideoSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedVideoFile) {
      setAddCamError(
        "Please select a valid video file (.mp4, .avi, .mkv, .mov) from your device.",
      );
      return;
    }
    setAddCamLoading(true);
    setAddCamError("");

    try {
      const formData = new FormData();
      formData.append("video", selectedVideoFile);
      formData.append(
        "cameraName",
        newCameraName.trim() || selectedVideoFile.name,
      );
      formData.append(
        "location",
        newLocation.trim() || "Local Recorded Patrol",
      );
      if (userProfile.isDemo) formData.append("isDemo", "true");
      if (userProfile.email) formData.append("userEmail", userProfile.email);
      if (userProfile.fullname)
        formData.append("userName", userProfile.fullname);
      if (userProfile.rank) formData.append("userRank", userProfile.rank);

      const headers = {};
      if (userProfile.isDemo) headers["x-demo-user"] = "true";
      if (userProfile.id) headers["x-user-id"] = userProfile.id.toString();
      if (userProfile.email) headers["x-user-email"] = userProfile.email;
      if (userProfile.fullname) headers["x-user-name"] = userProfile.fullname;
      if (userProfile.rank) headers["x-user-rank"] = userProfile.rank;

      const res = await fetch(`${apiBase}/api/camera/upload`, {
        method: "POST",
        headers,
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.camera) {
        setCameras((prev) => [data.camera, ...prev]);
        setActiveCameraId(data.camera.id);
        setShowAddCameraModal(false);
        setSelectedVideoFile(null);
        setNewCameraName("");
        setNewLocation("");
        handleSelectCamera(data.camera);
      } else {
        setAddCamError(data.error || "Failed to upload and ingest video.");
      }
    } catch (err) {
      setAddCamError("Network error uploading video file.");
    } finally {
      setAddCamLoading(false);
    }
  };

  // Handle Dynamic RTSP / Stream Link Ingestion
  const handleAddCameraSubmit = async (e) => {
    if (e) e.preventDefault();
    setAddCamLoading(true);
    setAddCamError("");

    if (!newRtspLink.trim()) {
      setAddCamError(
        "Please provide a valid RTSP stream URL, HTTP stream, or test video file path.",
      );
      setAddCamLoading(false);
      return;
    }

    // Auto-clean any accidental "ip:" typos like rtsp://ip:100.98.7.93:8080/...
    let cleanStream = newRtspLink
      .trim()
      .replace(/^rtsp:\/\/ip:/i, "rtsp://")
      .replace(/^rtsps:\/\/ip:/i, "rtsps://")
      .replace(/^http:\/\/ip:/i, "http://")
      .replace(/^https:\/\/ip:/i, "https://");

    // Auto-normalize phone camera links without protocol (e.g. 192.168.0.133:8080 or 192.168.0.133:8554)
    if (
      !cleanStream.includes("://") &&
      !cleanStream.startsWith("/") &&
      !cleanStream.match(/^[a-zA-Z]:\\/) &&
      !cleanStream.match(/^\d+$/)
    ) {
      if (cleanStream.includes(":8080")) {
        cleanStream = `http://${cleanStream}`;
      } else if (
        cleanStream.includes(":8554") ||
        cleanStream.includes(":554")
      ) {
        cleanStream = `rtsp://${cleanStream}`;
      }
    }

    // If IP Webcam URL lacks /video path, auto-append /video
    if (
      cleanStream.startsWith("http://") ||
      cleanStream.startsWith("https://")
    ) {
      try {
        const u = new URL(cleanStream);
        if (u.port === "8080" && (u.pathname === "/" || u.pathname === "")) {
          u.pathname = "/video";
          cleanStream = u.toString();
        }
      } catch (_) {}
    }

    try {
      const headers = { "Content-Type": "application/json" };
      if (userProfile.isDemo) {
        headers["x-demo-user"] = "true";
      }
      if (userProfile.id) {
        headers["x-user-id"] = userProfile.id.toString();
      }
      if (userProfile.email) {
        headers["x-user-email"] = userProfile.email;
      }
      if (userProfile.fullname) {
        headers["x-user-name"] = userProfile.fullname;
      }
      if (userProfile.rank) {
        headers["x-user-rank"] = userProfile.rank;
      }

      const res = await fetch(`${apiBase}/api/camera`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          cameraName: newCameraName.trim() || "Tactical Perimeter Cam",
          rtsp_link: cleanStream,
          location: newLocation.trim() || "Sector Alpha Ground Post",
          isDemo: userProfile.isDemo,
          userId: userProfile.id,
          userEmail: userProfile.email,
          userName: userProfile.fullname,
          userRank: userProfile.rank,
        }),
      });

      const data = await res.json();
      if (res.ok && data.camera) {
        setCameras((prev) => [data.camera, ...prev]);
        setActiveCameraId(data.camera.id);
        setShowAddCameraModal(false);
        setNewCameraName("");
        setNewRtspLink("");
        setNewLocation("");
        handleSelectCamera(data.camera);
      } else {
        setAddCamError(
          data.error || "Failed to link camera. Please check parameters.",
        );
      }
    } catch (err) {
      setAddCamError("Network error contacting camera ingestion API.");
    } finally {
      setAddCamLoading(false);
    }
  };

  // Camera Connection Deletion / Disconnection
  const handleDeleteCamera = async (camId, e) => {
    if (e) e.stopPropagation();
    if (!camId) return;

    // Immediately update local camera state to eliminate UI flicker
    setCameras((prev) => {
      const remaining = prev.filter((c) => c.id !== camId);
      if (activeCameraId === camId) {
        if (remaining.length > 0) {
          handleSelectCamera(remaining[0]);
        } else {
          setActiveCameraId(null);
          setLiveFrame(null);
        }
      }
      return remaining;
    });

    // Immediately purge alerts for the removed camera so registry never glitches
    setAlerts((prev) =>
      prev.filter((a) => {
        const alertCid = (a.camera_id || "")
          .toString()
          .replace(/^CAM-/i, "")
          .trim();
        return alertCid !== camId.toString();
      }),
    );

    const headers = {};
    if (userProfile.isDemo) headers["x-demo-user"] = "true";
    if (userProfile.id) headers["x-user-id"] = userProfile.id.toString();

    try {
      const res = await fetch(`${apiBase}/api/camera/${camId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        console.warn("Failed to delete camera connection on server");
      }
    } catch (err) {
      console.error("Error deleting camera connection:", err);
    }
  };

  // Quick Preset Helpers
  const handleUsePhoneRtsp = () => {
    setNewCameraName("Mobile Tactical Scout");
    setNewRtspLink("rtsp://192.168.0.133:8554/");
    setNewLocation("Mobile Patrol Checkpoint");
  };

  const handleUsePhoneIpWebcam = () => {
    setNewCameraName("IP Webcam Stream");
    setNewRtspLink("http://192.168.0.133:8080/video");
    setNewLocation("Patrol Surveillance Point");
  };

  const handleUseLocalWebcam = () => {
    setNewCameraName("Local Command Terminal Webcam");
    setNewRtspLink("0");
    setNewLocation("Command Center Local Ingest");
  };

  // Active Camera & Breach Status (declared before filter usage to avoid TDZ ReferenceError)
  const activeCamera =
    cameras.find((c) => c.id === activeCameraId) || cameras[0] || null;
  const hasRecentBreach =
    alerts.length > 0 && alerts.some((a) => a && a.object_type === "person");

  // Filtered Alerts: strictly for the camera currently being monitored
  const activeCameraAlerts = alerts.filter((a) => {
    if (!a) return false;
    if (!activeCamera || !activeCamera.id) return true;
    const activeIdStr = activeCamera.id.toString();
    const activeUpper = `CAM-${activeIdStr}`.toUpperCase();
    const activeName = (activeCamera.cameraName || "").toLowerCase().trim();
    const spatialName = (a.spatial_coordinates?.camera_name || "")
      .toLowerCase()
      .trim();

    const alertCid = (a.camera_id || "").toString().trim();
    const alertCidUpper = alertCid.toUpperCase();
    const alertCidNum = alertCid.replace(/^CAM-/i, "").trim();

    return (
      alertCid === activeIdStr ||
      alertCidUpper === activeUpper ||
      alertCidNum === activeIdStr ||
      (activeName &&
        (alertCid.toLowerCase() === activeName || spatialName === activeName))
    );
  });

  const filteredAlerts = activeCameraAlerts.filter((a) => {
    if (!a) return false;
    const conf = parseFloat(a.confidence);
    const isCritical = isNaN(conf) ? true : conf >= 0.75;
    if (alertFilter === "critical") return isCritical;
    if (alertFilter === "warning") return !isCritical;
    return true;
  });

  // Authentication Flow
  const handleSignOut = () => {
    hasInitialActivatedRef.current = false;
    setLoggedIn(false);
    setUserProfile({
      id: null,
      fullname: "",
      email: "",
      rank: "",
      isDemo: false,
    });
    setCameras([]);
    setAlerts([]);
    setActiveCameraId(null);
    setLiveFrame(null);
    fetch(`${apiBase}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  };

  if (!loggedIn) {
    if (page === "register") {
      return (
        <Register
          onLogin={() => setPage("login")}
          onRegisterSuccess={(user) => {
            if (user) {
              setUserProfile({
                id: user.id || user._id,
                fullname: user.fullname || "Tactical Officer",
                email: user.email || "officer@netra-ai.mil",
                rank: user.rank || "Captain",
                isDemo: false,
              });
            }
            setCameras([]);
            setAlerts([]);
            setActiveCameraId(null);
            setLoggedIn(true);
          }}
        />
      );
    }
    return (
      <Login
        onLogin={(user) => {
          if (user) {
            setUserProfile({
              id: user.id || user._id,
              fullname: user.fullname || "Tactical Operator",
              email: user.email || "operator@netra-ai.mil",
              rank: user.rank || "Captain",
              isDemo: Boolean(user.isDemo),
            });
          }
          setCameras([]);
          setAlerts([]);
          setActiveCameraId(null);
          setLoggedIn(true);
        }}
        onRegister={() => setPage("register")}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* 5. Clean, Icon-Based Sidebar Navigation (No bulky sign-out at bottom left) */}
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-icon">🛡️</div>
          <div>
            <div className="brand-name">NETRA AI COMMAND</div>
            <div className="brand-tag">MILITARY SURVEILLANCE v2.5</div>
          </div>
        </div>

        <div className="nav-section-label">OPERATIONAL HUBS</div>
        <nav className="nav-menu">
          <button className="nav-item active" type="button">
            <span className="nav-icon">📊</span>
            <span className="nav-text">Command Dashboard</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => setShowAddCameraModal(true)}
          >
            <span className="nav-icon">📹</span>
            <span className="nav-text">Linked Cameras</span>
            <span className="nav-badge">{cameras.length}</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => setShowAddCameraModal(true)}
            style={{ color: "#38bdf8" }}
          >
            <span className="nav-icon">➕</span>
            <span className="nav-text">Add Camera</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              const el = document.getElementById("alerts-anchor");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span className="nav-icon">🚨</span>
            <span className="nav-text">Active Incidents</span>
            <span className="nav-badge alert-badge">{alerts.length}</span>
          </button>
          <button className="nav-item" type="button">
            <span className="nav-icon">📐</span>
            <span className="nav-text">+6M Perimeter Fence</span>
          </button>
        </nav>

        {/* Sidebar System Status Mini-Box */}
        <div className="sidebar-status-box">
          <div className="status-box-header">
            <span className="status-dot online pulse"></span>
            <strong>MONOLITH ACTIVE</strong>
          </div>
          <div className="status-box-sub">
            WebSocket:{" "}
            {wsStatus === "connected" ? "Streaming (5000)" : wsStatus}
          </div>
          <div className="latency-bar">
            <div className="latency-fill" style={{ width: "88%" }}></div>
          </div>
          <span className="latency-text">Inference: YOLOv8n Person Engine</span>
        </div>
      </aside>

      {/* Main Command Workspace */}
      <main className="main-content">
        {/* 1. Header & Global Layout with Pill Badges and Top-Right Profile Component */}
        <header className="tactical-header">
          <div>
            <div className="header-badge-row">
              <span className="tag-defcon">DEFCON 2 : HIGH ALERT</span>
              <span className="tag-pipeline">CONSOLIDATED MONOLITH v2.5</span>
              <span className="tag-ai">YOLOv8n-MIL ACTIVE</span>
            </div>
            <h1>Netra AI Command Center</h1>
            <p className="header-subtitle">
              Netra AI Tactical Video Analytics Platform • Border Surveillance &
              Perimeter Defense
            </p>
          </div>

          <div className="header-right">
            {/* Live Clock */}
            <div className="tactical-clock">
              <span className="clock-label">SYSTEM TIME</span>
              <span className="clock-value">{militaryTime}</span>
            </div>

            {/* Top-Right Officer Profile Component with Rank & Sign Out */}
            <div className="operator-chip">
              <div className="avatar-chip">🎖️</div>
              <div className="operator-info">
                <strong>
                  <span style={{ color: "#fbbf24", marginRight: "6px" }}>
                    {userProfile.rank}
                  </span>
                  {userProfile.fullname}
                </strong>
                <small>{userProfile.email}</small>
              </div>
              <button
                type="button"
                className="btn-logout"
                onClick={handleSignOut}
                title="Sign out of tactical terminal"
              >
                Sign Out
              </button>
            </div>

            <button
              type="button"
              className="btn-add-camera"
              onClick={() => setShowAddCameraModal(true)}
              title="Add new RTSP surveillance camera"
            >
              <span className="plus-icon">+</span> Add Camera
            </button>
          </div>
        </header>

        {/* 2. Tactical KPI & Telemetry Metric Cards */}
        <div className="kpi-grid">
          {/* Card 1: Active Ingestion Stream */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ color: "#38bdf8" }}>
              🎥
            </div>
            <div className="kpi-content">
              <span className="kpi-label">ACTIVE SURVEILLANCE FEED</span>
              <div className="kpi-row">
                <span className="kpi-value">
                  {activeCamera ? "ONLINE" : "OFFLINE"}
                </span>
                <span className="kpi-subtext">
                  {cameras.length} FEED{cameras.length === 1 ? "" : "S"} LINKED
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                }}
              >
                {activeCamera ? activeCamera.cameraName : "Standby • Link Feed"}
              </div>
            </div>
          </div>

          {/* Card 2: Restricted Perimeter (+6M Fence) */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ color: "#f59e0b" }}>
              📐
            </div>
            <div className="kpi-content">
              <span className="kpi-label">RESTRICTED PERIMETER</span>
              <div className="kpi-row">
                <span className="kpi-value" style={{ color: "#f59e0b" }}>
                  +6M
                </span>
                <span className="kpi-subtext">TACTICAL FENCE ROI</span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                }}
              >
                Lower Screen Boundary (6m)
              </div>
            </div>
          </div>

          {/* Card 3: Email Notifications */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ color: "#34d399" }}>
              ✉️
            </div>
            <div className="kpi-content">
              <span className="kpi-label">BREACH NOTIFICATIONS</span>
              <div className="kpi-row">
                <span className="kpi-value green-text">ARMED</span>
                <span className="kpi-subtext">45s COOLDOWN</span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Target: {userProfile.email}
              </div>
            </div>
          </div>

          {/* Card 4: Total Intrusion Alerts */}
          <div className={`kpi-card ${hasRecentBreach ? "danger-card" : ""}`}>
            <div className="kpi-icon-wrap" style={{ color: "#f87171" }}>
              ⚠️
            </div>
            <div className="kpi-content">
              <span className="kpi-label">TACTICAL BREACH ALERTS</span>
              <div className="kpi-row">
                <span className="kpi-value danger-text">{alerts.length}</span>
                <span className="kpi-subtext">
                  {hasRecentBreach ? "CRITICAL BREACH" : "PERIMETER SECURE"}
                </span>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                }}
              >
                PostgreSQL Real-Time Registry
              </div>
            </div>
          </div>
        </div>

        {/* Two-Column Surveillance Workspace */}
        <div className="operations-grid">
          {/* 3. Structured Video Player Container (Dynamic RTSP, NO hardcoded Cam 04) */}
          <div className="surveillance-stage">
            <div className="featured-feed-container">
              <div className="primary-viewport-card">
                {/* Viewport HUD Header with Telemetry Pill Badges */}
                <div className="viewport-hud-header">
                  <div className="hud-left">
                    <span className="hud-live-tag">
                      {activeCamera ? "LIVE RTSP STREAM" : "STANDBY"}
                    </span>
                    <span className="hud-cam-name">
                      {activeCamera
                        ? activeCamera.cameraName
                        : "Awaiting Camera Link"}
                    </span>
                    <span className="hud-location">
                      •{" "}
                      {activeCamera
                        ? activeCamera.location
                        : "Perimeter Sector"}
                    </span>
                  </div>

                  <div className="hud-right">
                    <span className="hud-stat">1280x720</span>
                    <span className="hud-stat">YOLOv8n-Mil</span>
                    <span className="hud-stat">FPS: {fps > 0 ? fps : 30}</span>
                    <span className="hud-stat">LATENCY: ~18ms</span>
                    <span className="hud-stat">RTSP/WS</span>
                  </div>
                </div>

                {/* Structured Video Display Frame with Aesthetic Corner Brackets */}
                <div className="primary-video-display">
                  {/* Tactical Reticle Corner Brackets */}
                  <div className="hud-corner top-left"></div>
                  <div className="hud-corner top-right"></div>
                  <div className="hud-corner bottom-left"></div>
                  <div className="hud-corner bottom-right"></div>

                  {activeCamera && liveFrame ? (
                    <img
                      src={liveFrame}
                      alt="Live Tactical Stream"
                      className="primary-stream-image"
                    />
                  ) : (
                    /* Clean Tactical Standby Radar (No hardcoded fallback camera) */
                    <div className="video-placeholder-tactical">
                      <div className="radar-spinner"></div>
                      <div className="placeholder-status-title">
                        STANDBY • NO RTSP FEED LINKED
                      </div>
                      <div className="placeholder-sub">
                        Link an RTSP surveillance stream or test video to
                        initialize live computer vision.
                      </div>
                      <button
                        type="button"
                        className="login-button"
                        style={{ marginTop: "18px", maxWidth: "260px" }}
                        onClick={() => setShowAddCameraModal(true)}
                      >
                        + Link Tactical RTSP Camera
                      </button>
                    </div>
                  )}
                </div>

                {/* Viewport HUD Footer */}
                <div className="viewport-hud-footer">
                  <div className="hud-footer-left">
                    <span className="sensor-tag" style={{ color: "#facc15" }}>
                      📐 +6M TACTICAL PERIMETER FENCE ACTIVE
                    </span>
                    <span className="sensor-tag">
                      • AUTOMATED EMAIL NOTIFIER: {userProfile.email}
                    </span>
                  </div>
                  <div className="hud-footer-right">
                    <button
                      type="button"
                      className="btn-hud"
                      onClick={() => setShowAddCameraModal(true)}
                    >
                      + Switch / Link Camera
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Linked Cameras Strip */}
              {cameras.length > 0 && (
                <div className="secondary-feeds-strip">
                  {cameras.map((c) => (
                    <div
                      key={c.id}
                      className={`secondary-cam-card ${c.id === activeCameraId ? "selected" : ""}`}
                      onClick={() => handleSelectCamera(c)}
                    >
                      <div className="sec-cam-header">
                        <span className="sec-cam-title">{c.cameraName}</span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span className="sec-cam-badge live-ai">ACTIVE</span>
                          <button
                            type="button"
                            className="btn-disconnect-cam"
                            title="Disconnect and remove this camera connection"
                            onClick={(e) => handleDeleteCamera(c.id, e)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="sec-cam-footer">
                        <strong>{c.location}</strong>
                        <span className="click-to-view">
                          Click to focus feed
                        </span>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-camera-tile"
                    onClick={() => setShowAddCameraModal(true)}
                    title="Add new RTSP surveillance feed"
                  >
                    <span className="add-tile-icon">+</span>
                    <span className="add-tile-text">Add Camera</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4. Tactical Alert Registry (Distinct cards with color-coded left borders) */}
          <aside className="intel-card">
            <div className="intel-card-header">
              <div>
                <h3>Tactical Breach Registry</h3>
                <p>Live surveillance event feed</p>
              </div>
              <span className="alert-count-pill">
                {filteredAlerts.length} BREACHES
              </span>
            </div>

            {/* Alert Severity Filter Tabs */}
            <div className="alert-filters">
              <button
                type="button"
                className={`filter-btn ${alertFilter === "all" ? "active" : ""}`}
                onClick={() => setAlertFilter("all")}
              >
                All Events
              </button>
              <button
                type="button"
                className={`filter-btn ${alertFilter === "critical" ? "active" : ""}`}
                onClick={() => setAlertFilter("critical")}
              >
                Critical Breaches
              </button>
            </div>

            {/* Scrollable Alert Cards List */}
            <div className="alerts-scroll-area">
              {filteredAlerts.length === 0 ? (
                <div className="no-alerts-empty">
                  <div className="shield-icon">
                    {activeCamera ? "🛡️" : "📡"}
                  </div>
                  <h4>
                    {activeCamera ? "PERIMETER SECURE" : "NO CAMERA MONITORED"}
                  </h4>
                  <p>
                    {activeCamera
                      ? `No unauthorized breaches detected on ${activeCamera.cameraName}.`
                      : "Select or link an RTSP camera feed to monitor live perimeter breaches."}
                  </p>
                </div>
              ) : (
                filteredAlerts.map((alert, idx) => {
                  const conf = parseFloat(alert.confidence);
                  const isCritical = isNaN(conf) ? true : conf >= 0.75;
                  return (
                    <div
                      key={alert.alert_id || idx}
                      className={`tactical-alert-item ${
                        isCritical ? "critical-alert" : "warning-alert"
                      }`}
                    >
                      {alert.snapshot_data ? (
                        <div className="alert-thumb-wrap">
                          <img
                            src={alert.snapshot_data}
                            alt="Breach Snapshot"
                            className="alert-thumbnail"
                          />
                        </div>
                      ) : (
                        <div className="alert-thumb-wrap">
                          <span className="alert-thumb-placeholder">🚨</span>
                        </div>
                      )}

                      <div className="alert-info-col">
                        <div className="alert-title-row">
                          <span className="alert-object">
                            {alert.object_type
                              ? alert.object_type.toUpperCase()
                              : "PERSON"}{" "}
                            BREACH
                          </span>
                          <span className="alert-time">
                            {alert.event_timestamp
                              ? new Date(
                                  alert.event_timestamp,
                                ).toLocaleTimeString()
                              : "Just Now"}
                          </span>
                        </div>
                        <div className="alert-desc">
                          Unauthorized target crossed{" "}
                          <strong>+6M Tactical Perimeter Fence</strong>
                        </div>
                        <div className="alert-meta-footer">
                          <span className="badge-confidence">
                            {!isNaN(conf)
                              ? `${Math.round(conf * 100)}% Conf.`
                              : "92% Conf."}
                          </span>
                          <span>•</span>
                          <span>Track #{alert.tracking_id || "01"}</span>
                          <span>•</span>
                          <span>
                            {activeCamera?.cameraName || "Perimeter Cam"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Dynamic Link RTSP Camera Modal */}
      {showAddCameraModal && (
        <div
          className="add-camera-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddCameraModal(false);
            }
          }}
        >
          <div className="add-camera-card">
            {/* Cut / Close Button */}
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowAddCameraModal(false)}
              title="Close modal (Esc)"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="add-camera-header">
              <div className="add-camera-icon">
                {ingestMode === "video" ? "📁" : "📡"}
              </div>
              <div>
                <h2 className="add-camera-title">
                  {ingestMode === "video"
                    ? "Ingest Video File"
                    : "Ingest RTSP / Stream Link"}
                </h2>
                <p className="add-camera-subtitle">
                  {ingestMode === "video"
                    ? "Upload any video file (.mp4, .avi, .mkv, .mov) to run YOLOv8 person tracking & +6M Tactical Fence intrusion detection."
                    : "Connect an RTSP stream, IP Webcam HTTP feed, or local webcam to run live tactical surveillance."}
                </p>
              </div>
            </div>

            {/* Ingestion Mode Switcher Tabs */}
            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab-btn ${ingestMode === "video" ? "active" : ""}`}
                onClick={() => {
                  setIngestMode("video");
                  setAddCamError("");
                }}
              >
                📁 Upload Local Video File
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${ingestMode === "stream" ? "active" : ""}`}
                onClick={() => {
                  setIngestMode("stream");
                  setAddCamError("");
                }}
              >
                🌐 RTSP / Network Stream Link
              </button>
            </div>

            {ingestMode === "video" ? (
              <form
                onSubmit={handleUploadVideoSubmit}
                className="add-camera-form"
              >
                {/* File Dropzone */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="video/*,.mp4,.avi,.mkv,.mov,.webm"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedVideoFile(e.target.files[0]);
                      if (!newCameraName) {
                        setNewCameraName(
                          e.target.files[0].name.replace(/\.[^/.]+$/, ""),
                        );
                      }
                    }
                  }}
                  style={{ display: "none" }}
                />

                {!selectedVideoFile ? (
                  <div
                    className="file-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add("dragover");
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("dragover");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("dragover");
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        setSelectedVideoFile(e.dataTransfer.files[0]);
                        if (!newCameraName) {
                          setNewCameraName(
                            e.dataTransfer.files[0].name.replace(
                              /\.[^/.]+$/,
                              "",
                            ),
                          );
                        }
                      }
                    }}
                  >
                    <div className="dropzone-icon">🎬</div>
                    <div className="dropzone-text">
                      Click to Browse or Drag & Drop Video File
                    </div>
                    <div className="dropzone-hint">
                      Supports MP4, AVI, MKV, MOV, WebM (up to 500MB)
                    </div>
                  </div>
                ) : (
                  <div className="selected-file-badge">
                    <div style={{ fontSize: "24px" }}>🎥</div>
                    <div className="selected-file-info">
                      <div className="selected-file-name">
                        {selectedVideoFile.name}
                      </div>
                      <div className="selected-file-size">
                        {(selectedVideoFile.size / (1024 * 1024)).toFixed(2)} MB
                        • Ready for AI Ingestion
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-remove-file"
                      onClick={() => setSelectedVideoFile(null)}
                    >
                      Change File
                    </button>
                  </div>
                )}

                <div className="input-group">
                  <label htmlFor="cam-name-vid">Video / Feed Name</label>
                  <input
                    id="cam-name-vid"
                    type="text"
                    placeholder="e.g. Northern Sector Drone Patrol Alpha"
                    value={newCameraName}
                    onChange={(e) => setNewCameraName(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="cam-loc-vid">Sector / Recon Location</label>
                  <input
                    id="cam-loc-vid"
                    type="text"
                    placeholder="e.g. Ground Perimeter Post A"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "12px",
                    color: "#fbbf24",
                  }}
                >
                  <span>
                    🛡️ <strong>Automated Protection:</strong> Real-time YOLOv8
                    person detection monitors the{" "}
                    <strong>+6-meter tactical perimeter fence</strong> (covering
                    the lower screen boundary). Any person entering the
                    perimeter triggers alerts and emails{" "}
                    <strong>{userProfile.email}</strong>.
                  </span>
                </div>

                {addCamError && (
                  <div className="auth-alert error-alert">
                    <span>⚠️</span>
                    <p>{addCamError}</p>
                  </div>
                )}

                <div className="add-camera-actions">
                  <button
                    type="submit"
                    className="login-button"
                    disabled={addCamLoading}
                  >
                    {addCamLoading
                      ? "Uploading & Starting AI Detection..."
                      : "🎥 Upload & Start AI Detection"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowAddCameraModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleAddCameraSubmit}
                className="add-camera-form"
              >
                <div className="input-group">
                  <label htmlFor="cam-rtsp">
                    RTSP Stream Link / Stream URL
                  </label>
                  <input
                    id="cam-rtsp"
                    type="text"
                    placeholder="rtsp://192.168.1.100:8554/live or http://192.168.1.100:8080/video"
                    value={newRtspLink}
                    onChange={(e) => setNewRtspLink(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* Quick Fill Testing Helper Chips */}
                <div className="preset-chip-group">
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={handleUsePhoneRtsp}
                  >
                    📱 Phone RTSP (rtsp://192.168.0.133:8554/)
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={handleUsePhoneIpWebcam}
                  >
                    🌐 IP Webcam (http://192.168.0.133:8080/video)
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={handleUseLocalWebcam}
                  >
                    📷 PC Webcam (0)
                  </button>
                </div>

                <div className="input-group">
                  <label htmlFor="cam-name">
                    Custom Stream Designation / Name
                  </label>
                  <input
                    id="cam-name"
                    type="text"
                    placeholder="e.g. Northern Sector Alpha Watch"
                    value={newCameraName}
                    onChange={(e) => setNewCameraName(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="cam-loc">Sector / Geographic Location</label>
                  <input
                    id="cam-loc"
                    type="text"
                    placeholder="e.g. Northern Perimeter Post A"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "12px",
                    color: "#fbbf24",
                  }}
                >
                  <span>
                    📱 <strong>Tip for Phone Streams:</strong> Ensure your phone
                    & PC are on the <strong>same Wi-Fi</strong>. For Android IP
                    Webcam app, use{" "}
                    <code>http://&lt;phone-ip&gt;:8080/video</code>.
                  </span>
                </div>

                {addCamError && (
                  <div className="auth-alert error-alert">
                    <span>⚠️</span>
                    <p>{addCamError}</p>
                  </div>
                )}

                <div className="add-camera-actions">
                  <button
                    type="submit"
                    className="login-button"
                    disabled={addCamLoading}
                  >
                    {addCamLoading
                      ? "Initiating Stream Ingestion..."
                      : "📡 Connect & Ingest Stream"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowAddCameraModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Connected Feeds & Management */}
            {cameras.length > 0 && (
              <div className="modal-connected-cams">
                <div className="modal-connected-header">
                  <h4>🔗 Active Connected Feeds ({cameras.length})</h4>
                  <span className="modal-connected-hint">
                    Click Disconnect to remove any connection
                  </span>
                </div>
                <div className="modal-connected-list">
                  {cameras.map((c) => (
                    <div key={c.id} className="modal-connected-item">
                      <div className="modal-cam-info">
                        <div className="modal-cam-name">
                          {c.cameraName}
                          {c.id === activeCameraId && (
                            <span className="active-tag">FOCUS</span>
                          )}
                        </div>
                        <div className="modal-cam-meta">
                          {c.location || "Sector Alpha"} •{" "}
                          {c.rtsp_link || "Video Ingest"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-modal-disconnect"
                        onClick={(e) => handleDeleteCamera(c.id, e)}
                        title="Disconnect this feed"
                      >
                        ✕ Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithBoundary;
