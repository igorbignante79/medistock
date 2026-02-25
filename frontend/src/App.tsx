import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { getToken } from "./api";

export default function App() {
  const authed = !!getToken();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={authed ? <DashboardPage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
