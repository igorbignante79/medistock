import React, { useEffect, useState } from "react";
import { getCloud, clearToken } from "../api";
import type { CloudPayload } from "../types";

export default function DashboardPage() {
  const [cloud, setCloud] = useState<CloudPayload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getCloud();
        setCloud(data);
      } catch {
        setErr("Errore nel caricare i dati (token o backend).");
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Dashboard</h2>
        <button
          onClick={() => {
            clearToken();
            location.hash = "#/login";
          }}
        >
          Esci
        </button>
      </div>

      {err && <div style={{ color: "red" }}>{err}</div>}
      {!cloud ? (
        <div>Caricamento...</div>
      ) : (
        <div>
          <p><b>Prodotti:</b> {cloud.products.length}</p>
          <p><b>Movimenti:</b> {cloud.transactions.length}</p>
          <p><b>Utenti:</b> {cloud.users.length}</p>
        </div>
      )}
    </div>
  );
}