import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, setToken } from "../api";

export default function LoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const data = await login(username, password);
      setToken(data.token);
      nav("/");
    } catch {
      setErr("Login fallito");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h2>Medistock</h2>
      <form onSubmit={onSubmit}>
        <div>
          <label>Username</label><br />
          <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label>Password</label><br />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%" }} />
        </div>
        {err && <div style={{ color: "red", marginTop: 10 }}>{err}</div>}
        <button style={{ marginTop: 12, width: "100%" }}>Entra</button>
      </form>
      <p style={{ opacity: 0.7, marginTop: 10 }}>Di default: admin / admin (cambiali in Render env)</p>
    </div>
  );
}
