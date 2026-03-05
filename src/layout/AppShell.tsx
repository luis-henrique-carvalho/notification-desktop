import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./AppShell.css";

const NAV_ITEMS = [
  { to: "/", label: "📊 Dashboard", end: true },
  { to: "/send", label: "✉️ Send Notification" },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">🔔</span>
          <span className="sidebar-title">
            Notification
            <br />
            Admin
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ["sidebar-link", isActive ? "sidebar-link--active" : ""]
                  .join(" ")
                  .trim()
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-avatar">
              {user?.name?.[0]?.toUpperCase() ?? "A"}
            </span>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.name}</span>
              <span className="sidebar-user-role">{user?.role}</span>
            </div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={logout}
            title="Sign out"
          >
            ⏻
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
