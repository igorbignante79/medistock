const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:10000";

export function setToken(t: string) {
  localStorage.setItem("token", t);
}
export function getToken() {
  return localStorage.getItem("token") || "";
}
export function clearToken() {
  localStorage.removeItem("token");
}

export async function login(username: string, password: string) {
  const r = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) throw new Error("Login failed");
  return r.json() as Promise<{ token: string; user: any }>;
}

export async function getCloud() {
  const token = getToken();
  const r = await fetch(`${API_BASE}/api/cloud`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error("Cloud fetch failed");
  return r.json();
}
