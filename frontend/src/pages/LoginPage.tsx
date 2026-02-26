import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Paper, PasswordInput, Text, TextInput, Title, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { login, setToken } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await login(username, password); // <-- prende token dal backend
      setToken(data.token); // <-- SALVA TOKEN (questa era la parte mancante)

      notifications.show({
        title: "Accesso effettuato",
        message: `Benvenuto, ${data.user?.username ?? "utente"}`,
        color: "green",
      });

      navigate("/");
    } catch {
      notifications.show({
        title: "Errore di accesso",
        message: "Nome utente o password non corretti",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f8f9fa",
      }}
    >
      <Paper shadow="md" p="xl" radius="md" w={400}>
        <form onSubmit={handleLogin}>
          <Stack>
            <Title order={2} ta="center">
              Accesso a Medistock
            </Title>

            <Text c="dimmed" size="sm" ta="center">
              Sistema di gestione magazzino
            </Text>

            <TextInput
              label="Nome utente"
              placeholder="Inserisci il nome utente"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
            />

            <PasswordInput
              label="Password"
              placeholder="Inserisci la password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button type="submit" loading={loading} fullWidth mt="md">
              Accedi
            </Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}