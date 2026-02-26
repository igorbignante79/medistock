import React, { useEffect, useState } from "react";
import { Alert, Card, Group, Loader, SimpleGrid, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconPackage, IconArrowsLeftRight, IconUsers } from "@tabler/icons-react";
import { getCloud } from "../api";
import type { CloudPayload } from "../types";

export default function DashboardPage() {
  const [cloud, setCloud] = useState<CloudPayload | null>(null);
  const [errore, setErrore] = useState("");

  async function carica() {
    setErrore("");
    try {
      const data = await getCloud();
      setCloud(data);
    } catch {
      setErrore("Impossibile caricare i dati. Controlla connessione e accesso.");
    }
  }

  useEffect(() => {
    carica();
  }, []);

  if (errore) {
    return (
      <>
        <Title order={2}>Dashboard</Title>
        <Alert icon={<IconAlertCircle size={18} />} title="Errore" color="red" mt="md">
          {errore}
        </Alert>
      </>
    );
  }

  if (!cloud) {
    return (
      <Group mt="md">
        <Loader />
        <Text>Caricamento dati…</Text>
      </Group>
    );
  }

  return (
    <>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed">Riepilogo rapido della situazione magazzino</Text>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="md">
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <Text fw={700}>Articoli</Text>
            <IconPackage size={20} />
          </Group>
          <Text fz={34} fw={800} mt={6}>
            {cloud.products.length}
          </Text>
          <Text c="dimmed" size="sm">
            Numero totale articoli registrati
          </Text>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <Text fw={700}>Movimenti</Text>
            <IconArrowsLeftRight size={20} />
          </Group>
          <Text fz={34} fw={800} mt={6}>
            {cloud.transactions.length}
          </Text>
          <Text c="dimmed" size="sm">
            Carichi/scarichi registrati
          </Text>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between">
            <Text fw={700}>Utenti</Text>
            <IconUsers size={20} />
          </Group>
          <Text fz={34} fw={800} mt={6}>
            {cloud.users.length}
          </Text>
          <Text c="dimmed" size="sm">
            Utenti abilitati all’accesso
          </Text>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="md" mt="md">
        <Text fw={700} mb={6}>
          Anteprima ultimi articoli
        </Text>
        {cloud.products.length === 0 ? (
          <Text c="dimmed">Nessun articolo inserito. Vai su “Articoli” per aggiungerne uno.</Text>
        ) : (
          <div>
            {cloud.products.slice(0, 8).map((p) => (
              <Group key={p.id} justify="space-between" py={6} style={{ borderBottom: "1px solid #eee" }}>
                <div>
                  <Text fw={600}>{p.name}</Text>
                  <Text c="dimmed" size="sm">
                    Codice: {p.sku || "—"}
                  </Text>
                </div>
                <Text fw={800}>Qtà: {p.quantity}</Text>
              </Group>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}