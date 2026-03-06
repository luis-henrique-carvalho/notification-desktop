import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { io, Socket } from "socket.io-client";

interface NotificationSummary {
  notificationId: string;
  title: string;
  body: string;
  priority: "low" | "medium" | "high";
  broadcast: boolean;
  senderId: Record<string, never> | null;
  recipientCount: number;
  readCount: number;
  unreadCount: number;
  createdAt: string;
}

export function DashboardPage() {
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (pageNumber: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await api.GET(
        "/notifications/history",
        {
          params: { query: { page: pageNumber, limit: 10 } },
        },
      );

      if (apiError) {
        setError("Failed to load history.");
      } else if (data) {
        const raw = data as unknown as
          | { data?: unknown; history?: unknown }
          | unknown[];
        const list = Array.isArray(raw)
          ? raw
          : ((raw as { data?: unknown; history?: unknown }).data ??
            (raw as { data?: unknown; history?: unknown }).history ??
            []);
        setNotifications(
          (Array.isArray(list) ? list : []) as NotificationSummary[],
        );
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(page);
  }, [page]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    // Connect to Socket.IO using the token
    const socket: Socket = io("http://localhost:3000", {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("WebSocket connected to gateway");
    });

    // Task 5.3 — replaced admin:history_update with admin:notification_stats_updated
    // Task 5.4 — patch in-place without re-fetching from server
    socket.on(
      "admin:notification_stats_updated",
      (data: {
        notificationId: string;
        readCount: number;
        unreadCount: number;
        recipientCount: number;
      }) => {
        const { notificationId, readCount, unreadCount } = data;
        setNotifications((prev) =>
          prev.map((n) =>
            n.notificationId === notificationId
              ? { ...n, readCount, unreadCount }
              : n,
          ),
        );
      },
    );

    socket.on("connect_error", (err) => {
      console.error("WebSocket connection error:", err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [page]);

  return (
    <div>
      <h2 style={{ marginTop: 0, color: "#f1f5f9" }}>📊 Dashboard</h2>

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

      {loading && <p style={{ color: "#94a3b8" }}>Loading notifications...</p>}

      {!loading && notifications.length === 0 && !error && (
        <p style={{ color: "#94a3b8", fontStyle: "italic" }}>
          No notifications found.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {notifications &&
          notifications?.map((notif) => (
            <div
              key={notif.notificationId}
              style={{
                padding: 16,
                backgroundColor: "#1e293b",
                borderRadius: 8,
                borderLeft: `4px solid ${
                  notif.priority === "high"
                    ? "#ef4444"
                    : notif.priority === "medium"
                      ? "#f59e0b"
                      : "#3b82f6"
                }`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", fontSize: "1.1rem" }}>
                  {notif.title}
                </h3>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  {new Date(notif.createdAt).toLocaleString()}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  color: "#cbd5e1",
                  fontSize: "0.9rem",
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <div>
                  <strong>Target:</strong>{" "}
                  {notif.broadcast
                    ? "📢 Broadcast"
                    : `👥 ${notif.recipientCount} Users`}
                </div>
                <div>
                  <strong>Priority:</strong> {notif.priority.toUpperCase()}
                </div>
                <div>
                  <strong>Delivery:</strong> ✅{" "}
                  {notif.recipientCount - notif.unreadCount}/
                  {notif.recipientCount} Reached (Read: {notif.readCount})
                </div>
              </div>

              {/* Task 5.5 — link to NotificationDetailPage */}
              <Link
                to={`/notifications/${notif.notificationId}`}
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: "0.85rem",
                  color: "#60a5fa",
                  textDecoration: "none",
                }}
              >
                Ver detalhes →
              </Link>
            </div>
          ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={{
            padding: "8px 16px",
            backgroundColor: page === 1 ? "#334155" : "#3b82f6",
            color: "#f1f5f9",
            border: "none",
            borderRadius: 6,
            cursor: page === 1 ? "not-allowed" : "pointer",
          }}
        >
          Previous
        </button>
        <span style={{ color: "#cbd5e1" }}>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={notifications.length < 10}
          style={{
            padding: "8px 16px",
            backgroundColor: notifications.length < 10 ? "#334155" : "#3b82f6",
            color: "#f1f5f9",
            border: "none",
            borderRadius: 6,
            cursor: notifications.length < 10 ? "not-allowed" : "pointer",
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
