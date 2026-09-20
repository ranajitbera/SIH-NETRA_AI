import { useState } from "react";

function Register({ onLogin, onRegisterSuccess }) {
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gender, setGender] = useState("");
  const [rank, setRank] = useState("Captain");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const apiBase =
    import.meta.env.VITE_API_URL ||
    (window.location.port === "5173" ? "http://localhost:5000" : "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!gender) {
      setErrorMsg("Please select your gender / designation category.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passcodes do not match. Please re-enter.");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Passcode must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullname,
          email,
          password,
          confirmPassword,
          gender,
          rank,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(
          `Account registered! Officer Clearance: ${data.rank || rank}`,
        );
        setTimeout(() => {
          if (onRegisterSuccess) {
            onRegisterSuccess({
              id: data._id || data.id,
              fullname: data.fullname || fullname,
              email: data.email || email,
              rank: data.rank || rank,
              isDemo: false,
            });
          } else if (onLogin) {
            onLogin();
          }
        }, 1000);
      } else {
        setErrorMsg(data.error || "Registration failed. Please check inputs.");
      }
    } catch (err) {
      console.warn("Backend offline or registration error:", err);
      setErrorMsg(
        "Node.js API is offline. You can proceed with Demo Operator or retry.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🛡️</div>
          <h1>Create Operator Account</h1>
          <p className="login-subtitle">
            Register for Netra AI Tactical Border Surveillance
          </p>
          <div className="login-badge">SECURITY CLEARANCE REGISTRATION</div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="reg-fullname">Full Name</label>
            <input
              id="reg-fullname"
              type="text"
              placeholder="e.g. Rajesh Sharma"
              value={fullname}
              onChange={(e) => setFullname(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-rank">Military Rank / Designation</label>
            <div className="select-wrapper">
              <select
                id="reg-rank"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                required
                className="has-value"
              >
                <option value="Major General">Major General</option>
                <option value="Brigadier">Brigadier</option>
                <option value="Colonel">Colonel</option>
                <option value="Lieutenant Colonel">Lieutenant Colonel</option>
                <option value="Major">Major</option>
                <option value="Captain">Captain</option>
                <option value="Lieutenant">Lieutenant</option>
                <option value="Special Operator">Special Operator</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="reg-email">Military / Service Email</label>
            <input
              id="reg-email"
              type="email"
              placeholder="e.g. rajesh.sharma@netra-ai.mil"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-password">Passcode</label>
            <input
              id="reg-password"
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-confirmpassword">Confirm Passcode</label>
            <input
              id="reg-confirmpassword"
              type="password"
              placeholder="Re-enter passcode"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-gender">Gender / Officer Category</label>
            <div className="select-wrapper">
              <select
                id="reg-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                required
                className={gender ? "has-value" : ""}
              >
                <option value="" disabled>
                  -- Select gender profile --
                </option>
                <option value="male">Male (Officer)</option>
                <option value="female">Female (Officer)</option>
                <option value="other">Other / Special Operator</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="auth-alert error-alert">
              <span>⚠️</span>
              <p>{errorMsg}</p>
            </div>
          )}

          {successMsg && (
            <div className="auth-alert success-alert">
              <span>✓</span>
              <p>{successMsg}</p>
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Registering Officer..." : "Create Tactical Account"}
          </button>

          <div className="switch-page">
            <span>Already have security clearance? </span>
            <button type="button" className="link-button" onClick={onLogin}>
              Sign In to Command Center
            </button>
          </div>
        </form>

        <div className="login-footer">
          <span>Authorized Military Personnel Only • TensorTribe Netra AI</span>
        </div>
      </div>
    </div>
  );
}

export default Register;
