import type { Server } from "node:http";
import type { Server as IOServer } from "socket.io";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  drainConnections,
  trackInFlightRequests,
  registerShutdownHandlers,
  _getInFlightCount,
  _resetState,
} from "../graceful-shutdown";

// Mock prisma
vi.mock("../prisma", () => ({
  prisma: {
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

function createMockRes() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    on(event: string, fn: () => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    emit(event: string) {
      (listeners[event] || []).forEach((fn) => fn());
    },
  };
}

describe("graceful-shutdown", () => {
  beforeEach(() => {
    _resetState();
  });

  afterEach(() => {
    _resetState();
  });

  describe("trackInFlightRequests", () => {
    it("increments count on request and decrements on finish", () => {
      const res = createMockRes();
      const next = vi.fn();

      expect(_getInFlightCount()).toBe(0);

      trackInFlightRequests({}, res, next);
      expect(next).toHaveBeenCalled();
      expect(_getInFlightCount()).toBe(1);

      res.emit("finish");
      expect(_getInFlightCount()).toBe(0);
    });

    it("decrements count on close event", () => {
      const res = createMockRes();
      const next = vi.fn();

      trackInFlightRequests({}, res, next);
      expect(_getInFlightCount()).toBe(1);

      res.emit("close");
      expect(_getInFlightCount()).toBe(0);
    });

    it("tracks multiple concurrent requests", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      const res3 = createMockRes();
      const next = vi.fn();

      trackInFlightRequests({}, res1, next);
      trackInFlightRequests({}, res2, next);
      trackInFlightRequests({}, res3, next);
      expect(_getInFlightCount()).toBe(3);

      res1.emit("finish");
      expect(_getInFlightCount()).toBe(2);

      res2.emit("finish");
      res3.emit("close");
      expect(_getInFlightCount()).toBe(0);
    });
  });

  describe("drainConnections", () => {
    it("resolves immediately when no in-flight requests", async () => {
      const result = await drainConnections(1000);
      expect(result).toBe(true);
    });

    it("waits for in-flight requests to complete", async () => {
      const res = createMockRes();
      const next = vi.fn();
      trackInFlightRequests({}, res, next);

      // Simulate the request finishing after 100ms
      setTimeout(() => res.emit("finish"), 100);

      const result = await drainConnections(5000);
      expect(result).toBe(true);
      expect(_getInFlightCount()).toBe(0);
    });

    it("returns false when timeout is reached with pending requests", async () => {
      const res = createMockRes();
      const next = vi.fn();
      trackInFlightRequests({}, res, next);

      // Don't finish the request — let it time out
      const result = await drainConnections(500);
      expect(result).toBe(false);
      expect(_getInFlightCount()).toBe(1);

      // Clean up
      res.emit("finish");
    });
  });

  describe("registerShutdownHandlers", () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>;
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processOnSpy = vi.spyOn(process, "on");
      processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    });

    afterEach(() => {
      processOnSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it("registers handlers for SIGTERM and SIGINT", () => {
      const mockServer = {
        close: vi.fn((cb: (err?: Error) => void) => cb()),
      } as unknown as Server;
      const mockIo = {
        disconnectSockets: vi.fn(),
      } as unknown as IOServer;

      registerShutdownHandlers(mockServer, mockIo);

      const registeredSignals = processOnSpy.mock.calls.map((call) => call[0]);
      expect(registeredSignals).toContain("SIGTERM");
      expect(registeredSignals).toContain("SIGINT");
    });

    it("calls server.close, io.disconnectSockets, and prisma.$disconnect on shutdown", async () => {
      const mockServer = {
        close: vi.fn((cb: (err?: Error) => void) => cb()),
      } as unknown as Server;
      const mockIo = {
        disconnectSockets: vi.fn(),
      } as unknown as IOServer;

      const stopOutboxWorker = vi.fn().mockResolvedValue(undefined);

      registerShutdownHandlers(mockServer, mockIo, { stopOutboxWorker });

      // Find the SIGTERM handler and invoke it
      const sigtermCall = processOnSpy.mock.calls.find((call) => call[0] === "SIGTERM");
      expect(sigtermCall).toBeDefined();

      const handler = sigtermCall![1] as () => void;
      handler();

      // Wait for async shutdown to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(mockServer.close).toHaveBeenCalled();
      expect(mockIo.disconnectSockets).toHaveBeenCalledWith(true);
      expect(stopOutboxWorker).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it("calls onShutdownStart callback if provided", async () => {
      const mockServer = {
        close: vi.fn((cb: (err?: Error) => void) => cb()),
      } as unknown as Server;
      const mockIo = {
        disconnectSockets: vi.fn(),
      } as unknown as IOServer;

      const onShutdownStart = vi.fn().mockResolvedValue(undefined);

      registerShutdownHandlers(mockServer, mockIo, { onShutdownStart });

      const sigtermCall = processOnSpy.mock.calls.find((call) => call[0] === "SIGTERM");
      const handler = sigtermCall![1] as () => void;
      handler();

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(onShutdownStart).toHaveBeenCalled();
    });

    it("handles server.close error gracefully and continues shutdown", async () => {
      const mockServer = {
        close: vi.fn((cb: (err?: Error) => void) => cb(new Error("Already closed"))),
      } as unknown;
      const mockIo = {
        disconnectSockets: vi.fn(),
      } as unknown;

      registerShutdownHandlers(mockServer, mockIo);

      const sigtermCall = processOnSpy.mock.calls.find((call) => call[0] === "SIGTERM");
      const handler = sigtermCall![1] as () => void;
      handler();

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should still proceed and exit
      expect(mockIo.disconnectSockets).toHaveBeenCalledWith(true);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });
});
