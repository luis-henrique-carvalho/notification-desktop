import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../pages/DashboardPage";

// ── Mock socket.io-client ──────────────────────────────────────────────────
const socketListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const mockSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (!socketListeners[event]) socketListeners[event] = [];
    socketListeners[event].push(cb);
  }),
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

// ── Mock API client ────────────────────────────────────────────────────────
vi.mock("../api/client", () => ({
  default: {
    GET: vi.fn(),
  },
}));

import api from "../api/client";

// ── Helper: emit a socket event ────────────────────────────────────────────
function emitSocket(event: string, data: unknown) {
  (socketListeners[event] ?? []).forEach((cb) => cb(data));
}

// ── Sample data ────────────────────────────────────────────────────────────
const makeNotification = (
  overrides: Partial<{
    notificationId: string;
    title: string;
    readCount: number;
    unreadCount: number;
    recipientCount: number;
  }> = {},
) => ({
  notificationId: "notif-1",
  title: "Hello",
  body: "Body text",
  priority: "low" as const,
  broadcast: false,
  senderId: null,
  recipientCount: 5,
  readCount: 2,
  unreadCount: 3,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ── Helpers ────────────────────────────────────────────────────────────────
function mockApiSuccess(notifications: ReturnType<typeof makeNotification>[]) {
  (api.GET as Mock).mockResolvedValue({
    data: notifications,
    error: undefined,
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear captured listeners
    for (const key of Object.keys(socketListeners)) {
      delete socketListeners[key];
    }
    localStorage.setItem("auth_token", "test-token");
  });

  describe("5.1 — admin:notification_stats_updated updates matching card without HTTP request", () => {
    it("updates readCount and unreadCount in-place when event matches notificationId", async () => {
      const initial = makeNotification({
        notificationId: "notif-1",
        readCount: 2,
        unreadCount: 3,
      });
      mockApiSuccess([initial]);

      renderDashboard();

      // Wait for initial load
      await waitFor(() =>
        expect(screen.getByText("Hello")).toBeInTheDocument(),
      );

      // Confirm initial stats are rendered
      expect(screen.getByText(/Read: 2/)).toBeInTheDocument();

      const getCallCountBefore = (api.GET as Mock).mock.calls.length;

      // Emit the real-time event
      act(() => {
        emitSocket("admin:notification_stats_updated", {
          notificationId: "notif-1",
          readCount: 4,
          unreadCount: 1,
          recipientCount: 5,
        });
      });

      // Stats should update in-place
      await waitFor(() =>
        expect(screen.getByText(/Read: 4/)).toBeInTheDocument(),
      );

      // No additional HTTP request should have been made
      expect((api.GET as Mock).mock.calls.length).toBe(getCallCountBefore);
    });
  });

  describe("5.2 — admin:notification_stats_updated for different notificationId is ignored", () => {
    it("does not alter cards when event notificationId does not match", async () => {
      const notif1 = makeNotification({
        notificationId: "notif-1",
        title: "First",
        readCount: 1,
        unreadCount: 4,
      });
      const notif2 = makeNotification({
        notificationId: "notif-2",
        title: "Second",
        readCount: 0,
        unreadCount: 5,
      });
      mockApiSuccess([notif1, notif2]);

      renderDashboard();

      await waitFor(() =>
        expect(screen.getByText("First")).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.getByText("Second")).toBeInTheDocument(),
      );

      // Emit event for notif-99 which doesn't exist in the list
      act(() => {
        emitSocket("admin:notification_stats_updated", {
          notificationId: "notif-99",
          readCount: 99,
          unreadCount: 0,
          recipientCount: 5,
        });
      });

      // Both cards should remain unchanged
      await waitFor(() => {
        expect(screen.getByText(/Read: 1/)).toBeInTheDocument();
        expect(screen.getByText(/Read: 0/)).toBeInTheDocument();
      });
    });
  });
});
