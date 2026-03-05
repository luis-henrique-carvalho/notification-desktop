import { useState, useEffect } from "react";
import api from "../api/client";

interface User {
  id: string;
  name: string;
  email: string;
}

export function SendNotificationPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [broadcast, setBroadcast] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      if (broadcast) return; // Don't fetch if broadcast is true
      setLoadingUsers(true);
      try {
        const { data, error } = await api.GET("/users", {
          params: { query: { search, limit: 100 } },
        });

        if (error) {
          console.error("Failed to fetch users", error);
        } else if (data) {
          // @ts-ignore - API typing might be incomplete for /users
          setUsers((data.users || data) as User[]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingUsers(false);
      }
    }

    // simple debounce
    const timeout = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timeout);
  }, [search, broadcast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!broadcast && selectedUserIds.length === 0) {
      setError("Please select at least one user or enable broadcast.");
      return;
    }

    setLoading(true);
    try {
      const { error: apiError } = await api.POST("/notifications", {
        body: {
          title,
          body,
          priority,
          broadcast,
          userIds: broadcast ? undefined : selectedUserIds,
        },
      });

      if (apiError) {
        setError("Failed to send notification: " + JSON.stringify(apiError));
      } else {
        setSuccess(true);
        setTitle("");
        setBody("");
        setPriority("medium");
        setSelectedUserIds([]);
        setBroadcast(false);
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginTop: 0, color: "#f1f5f9" }}>✉️ Send Notification</h2>

      {success && (
        <div style={{ padding: 12, backgroundColor: "#065f46", color: "#6ee7b7", borderRadius: 6, marginBottom: 16 }}>
          Notification sent successfully!
        </div>
      )}

      {error && (
        <div style={{ padding: 12, backgroundColor: "#7f1d1d", color: "#fca5a5", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, color: "#cbd5e1" }}>Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #334155", backgroundColor: "#1e293b", color: "#f1f5f9", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, color: "#cbd5e1" }}>Body</label>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #334155", backgroundColor: "#1e293b", color: "#f1f5f9", resize: "vertical", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, color: "#cbd5e1" }}>Priority</label>
          <div style={{ display: "flex", gap: 16 }}>
            {(["low", "medium", "high"] as const).map((p) => (
              <label key={p} style={{ display: "flex", alignItems: "center", gap: 4, color: "#cbd5e1", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="priority"
                  value={p}
                  checked={priority === p}
                  onChange={() => setPriority(p)}
                />
                <span style={{
                  color: p === "low" ? "#60a5fa" : p === "medium" ? "#fbbf24" : "#f87171",
                  fontWeight: "bold"
                }}>
                  {p.toUpperCase()}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
            />
            Broadcast to all users
          </label>
        </div>

        {!broadcast && (
          <div style={{ border: "1px solid #334155", borderRadius: 4, padding: 12, backgroundColor: "#0f172a" }}>
            <label style={{ display: "block", marginBottom: 8, color: "#cbd5e1" }}>Select Users ({selectedUserIds.length} selected)</label>
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #334155", backgroundColor: "#1e293b", color: "#f1f5f9", marginBottom: 12, boxSizing: "border-box" }}
            />

            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {loadingUsers && <div style={{ color: "#94a3b8" }}>Loading users...</div>}
              {!loadingUsers && users.length === 0 && <div style={{ color: "#94a3b8" }}>No users found.</div>}
              {!loadingUsers && users.map((user) => (
                <label key={user.id} style={{ display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", cursor: "pointer", padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span>
                    {user.name} <span style={{ color: "#64748b" }}>({user.email})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (!broadcast && selectedUserIds.length === 0)}
          style={{
            padding: "10px 16px",
            backgroundColor: loading ? "#3b82f680" : "#3b82f6",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: "bold",
            marginTop: 8
          }}
        >
          {loading ? "Sending..." : "Send Notification"}
        </button>
      </form>
    </div>
  );
}
