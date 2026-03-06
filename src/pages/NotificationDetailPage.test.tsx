import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NotificationDetailPage } from "./NotificationDetailPage";

// ── Mock socket.io-client ──────────────────────────────────────────────────
const socketListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const mockSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (!socketListeners[event]) socketListeners[event] = [];
    socketListeners[event].push(cb);
  }),
  off: vi.fn(),
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
const makeRecipient = (
  overrides: Partial<{
    userId: string;
    status: string;
    readAt: string | null;
    deliveredAt: string | null;
    acknowledgedAt: string | null;
  }> = {},
) => ({
  userId: "user-1",
  status: "delivered",
  readAt: null,
  deliveredAt: new Date().toISOString(),
  acknowledgedAt: null,
  ...overrides,
});

function mockApiSuccess(recipients: ReturnType<typeof makeRecipient>[]) {
  (api.GET as Mock).mockResolvedValue({
    data: recipients,
    error: undefined,
  });
}

function renderDetailPage(notificationId = "notif-1") {
  return render(
    <MemoryRouter initialEntries={[`/notifications/${notificationId}`]}>
      <Routes>
        <Route path="/notifications/:id" element={<NotificationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("NotificationDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear captured listeners
    for (const key of Object.keys(socketListeners)) {
      delete socketListeners[key];
    }
    localStorage.setItem("auth_token", "test-token");
  });

  // ── 6.1 — Mounts and fetches recipients list ────────────────────────────
  describe("6.1 — mount: calls GET /notifications/:id/recipients and shows the list", () => {
    it("calls api.GET with the correct path and displays recipient rows", async () => {
      const recipients = [
        makeRecipient({
          userId: "user-1",
          status: "read",
          readAt: new Date().toISOString(),
        }),
        makeRecipient({ userId: "user-2", status: "delivered" }),
      ];
      mockApiSuccess(recipients);

      renderDetailPage("notif-42");

      await waitFor(() =>
        expect(api.GET as Mock).toHaveBeenCalledWith(
          "/notifications/{id}/recipients",
          expect.objectContaining({
            params: expect.objectContaining({
              path: { id: "notif-42" },
            }),
          }),
        ),
      );

      await waitFor(() =>
        expect(screen.getByText("user-1")).toBeInTheDocument(),
      );
      expect(screen.getByText("user-2")).toBeInTheDocument();
    });

    it("shows 'Sem destinatários' when list is empty", async () => {
      mockApiSuccess([]);

      renderDetailPage("notif-empty");

      await waitFor(() =>
        expect(screen.getByText("Sem destinatários")).toBeInTheDocument(),
      );
    });
  });

  // ── 6.2 — admin:recipient_updated patches matching row in-place ──────────
  describe("6.2 — admin:recipient_updated with matching notificationId updates the row in-place", () => {
    it("updates the status of the matching user row without re-fetching", async () => {
      const initialRecipients = [
        makeRecipient({ userId: "user-1", status: "delivered" }),
      ];
      mockApiSuccess(initialRecipients);

      renderDetailPage("notif-1");

      await waitFor(() =>
        expect(screen.getByText("user-1")).toBeInTheDocument(),
      );

      // Confirm initial status icon
      expect(screen.getByTitle("delivered")).toBeInTheDocument();

      const getCallCountBefore = (api.GET as Mock).mock.calls.length;

      // Emit realtime update for the same notificationId
      act(() => {
        emitSocket("admin:recipient_updated", {
          notificationId: "notif-1",
          userId: "user-1",
          status: "read",
          readAt: new Date().toISOString(),
          acknowledgedAt: null,
        });
      });

      await waitFor(() =>
        expect(screen.getByTitle("read")).toBeInTheDocument(),
      );

      // No additional HTTP request
      expect((api.GET as Mock).mock.calls.length).toBe(getCallCountBefore);
    });
  });

  // ── 6.3 — admin:recipient_updated with different notificationId is ignored ─
  describe("6.3 — admin:recipient_updated with different notificationId is ignored", () => {
    it("does not alter rows when event notificationId does not match", async () => {
      const initialRecipients = [
        makeRecipient({ userId: "user-1", status: "delivered" }),
      ];
      mockApiSuccess(initialRecipients);

      renderDetailPage("notif-1");

      await waitFor(() =>
        expect(screen.getByText("user-1")).toBeInTheDocument(),
      );

      // Emit event for a DIFFERENT notificationId
      act(() => {
        emitSocket("admin:recipient_updated", {
          notificationId: "notif-OTHER",
          userId: "user-1",
          status: "read",
          readAt: new Date().toISOString(),
          acknowledgedAt: null,
        });
      });

      // Status should remain "delivered"
      await waitFor(() =>
        expect(screen.queryByTitle("read")).not.toBeInTheDocument(),
      );
      expect(screen.getByTitle("delivered")).toBeInTheDocument();
    });
  });
});
