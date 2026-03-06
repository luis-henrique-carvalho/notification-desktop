import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/client";
import { io, Socket } from "socket.io-client";
import type { components } from "../api/schema";

type Recipient = components["schemas"]["AdminNotificationRecipientDto"];

interface RecipientUpdatedEvent {
  notificationId: string;
  userId: string;
  status: string;
  readAt: string | null;
  acknowledgedAt: string | null;
}

// ── Status icon helpers ────────────────────────────────────────────────────
const STATUS_ICON: Record<string, string> = {
  created: "📭",
  delivered: "📬",
  read: "👁️",
  acknowledged: "✅",
};

function StatusIcon({ status }: { status: string }) {
  const icon = STATUS_ICON[status] ?? "❓";
  return (
    <span title={status} style={{ fontSize: "1.1rem" }}>
      {icon}
    </span>
  );
}

function formatDate(value: Record<string, never> | string | null): string {
  if (!value) return "—";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  try {
    return new Date(str).toLocaleString();
  } catch {
    return str;
  }
}

// ── Page component ─────────────────────────────────────────────────────────
export function NotificationDetailPage() {
  const { id: notificationId } = useParams<{ id: string }>();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 6.4 — Initial load via HTTP
  useEffect(() => {
    if (!notificationId) return;

    const fetchRecipients = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: apiError } = await api.GET(
          "/notifications/{id}/recipients",
          {
            params: { path: { id: notificationId } },
          },
        );

        if (apiError) {
          setError("Failed to load recipients.");
        } else if (data) {
          setRecipients(data as Recipient[]);
        }
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [notificationId]);

  // 6.5 — WebSocket listener: patch in-place by userId
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token || !notificationId) return;

    const socket: Socket = io("http://localhost:3000", {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("WebSocket connected (NotificationDetailPage)");
    });

    socket.on("admin:recipient_updated", (event: RecipientUpdatedEvent) => {
      // 6.3 — ignore events for other notifications
      if (event.notificationId !== notificationId) return;

      setRecipients((prev) =>
        prev.map((r) =>
          r.userId === event.userId
            ? {
                ...r,
                status: event.status,
                readAt: event.readAt as unknown as Record<string, never> | null,
                acknowledgedAt: event.acknowledgedAt as unknown as Record<
                  string,
                  never
                > | null,
              }
            : r,
        ),
      );
    });

    socket.on("connect_error", (err) => {
      console.error("WebSocket error (NotificationDetailPage):", err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [notificationId]);

  return (
    <div>
      {/* Back link */}
      <Link
        to="/"
        style={{
          display: "inline-block",
          marginBottom: 16,
          fontSize: "0.9rem",
          color: "#60a5fa",
          textDecoration: "none",
        }}
      >
        ← Voltar ao Dashboard
      </Link>

      <h2 style={{ marginTop: 0, color: "#f1f5f9" }}>
        📋 Destinatários da Notificação
      </h2>

      {notificationId && (
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: -8 }}>
          ID: <code style={{ color: "#e2e8f0" }}>{notificationId}</code>
        </p>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            backgroundColor: "#7f1d1d",
            color: "#fca5a5",
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading && <p style={{ color: "#94a3b8" }}>Loading recipients...</p>}

      {/* 6.7 — Empty state */}
      {!loading && !error && recipients.length === 0 && (
        <p style={{ color: "#94a3b8", fontStyle: "italic" }}>
          Sem destinatários
        </p>
      )}

      {/* 6.6 — Recipients table */}
      {!loading && recipients.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            borderRadius: 8,
            border: "1px solid #334155",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
              color: "#cbd5e1",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "#1e293b",
                  borderBottom: "1px solid #334155",
                  textAlign: "left",
                }}
              >
                {[
                  "Usuário",
                  "Status",
                  "Lido em",
                  "Entregue em",
                  "Confirmado em",
                ].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: "10px 14px",
                      color: "#94a3b8",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr
                  key={r.userId}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    backgroundColor: "transparent",
                  }}
                >
                  <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>
                    {r.userId}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <StatusIcon status={r.status} />{" "}
                    <span style={{ marginLeft: 6 }}>{r.status}</span>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    {formatDate(r.readAt as unknown as string | null)}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    {formatDate(r.deliveredAt as unknown as string | null)}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    {formatDate(r.acknowledgedAt as unknown as string | null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
