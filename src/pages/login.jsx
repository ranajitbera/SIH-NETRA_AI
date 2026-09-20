import { useState } from "react";

function Login({ onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const apiBase =
    import.meta.env.VITE_API_URL ||
    (window.location.port === "5173" ? "http://localhost:5000" : "");

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        onLogin({
          id: data._id || data.id,
          fullname: data.fullname || "Tactical Operator",
          email: data.email || email,
          rank: data.rank || "Captain",
          isDemo: false,
        });
      } else {
        setErrorMsg(
          data.error ||
            "Authentication failed. Check credentials or use Quick Demo Access.",
        );
      }
    } catch (err) {
      console.warn("Backend API unavailable:", err);
      setErrorMsg(
        "Node.js API offline. Use Quick Demo Access below to bypass.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    onLogin({
      id: 999999,
      fullname: "Major General Vikram Singh",
      email: "demo.operator@netra-ai.mil",
      rank: "Major General",
      isDemo: true,
    });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🛡️</div>
          <h1>Netra AI Command Center</h1>
          <p className="login-subtitle">
            Intelligent Border Video Analytics Platform
          </p>
          <div className="login-badge">
            AUTHORIZED PERSONNEL ONLY • DEFCON 2
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
          <div className="input-group">
            <label htmlFor="login-email">Military / Operator Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="e.g. general.admin@netra-ai.mil"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label htmlFor="login-password">Access Passcode</label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {errorMsg && (
            <div className="auth-alert error-alert">
              <span>⚠️</span>
              <p>{errorMsg}</p>
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading
              ? "Verifying Credentials..."
              : "Authenticate & Enter Command Center"}
          </button>

          <button
            type="button"
            onClick={handleDemoLogin}
            className="demo-button"
          >
            ⚡ Quick Demo Access (Bypass Login)
          </button>

          <div className="switch-page">
            <span>New Tactical Operator? </span>
            <button type="button" className="link-button" onClick={onRegister}>
              Register / Create Account
            </button>
          </div>
        </form>

        <div className="login-footer">
          <span>Decoupled Military Surveillance • TensorTribe Netra AI</span>
        </div>
      </div>
    </div>
  );
}

export default Login;
