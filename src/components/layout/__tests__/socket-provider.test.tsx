import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocketProvider, useSocket } from "../socket-provider";

const mockOn = vi.fn();
const mockEmit = vi.fn();
const mockOff = vi.fn();
const mockDisconnect = vi.fn();
const mockRemoveAllListeners = vi.fn();

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: mockOn,
    off: mockOff,
    emit: mockEmit,
    disconnect: mockDisconnect,
    removeAllListeners: mockRemoveAllListeners,
  })),
}));

function SocketConsumer() {
  const socket = useSocket();
  const subscribe = () => {
    const off = socket.on("metric:refreshed", () => undefined);
    socket.emit("dashboard:subscribe", { dashboard: "operating" });
    off();
  };

  return <button onClick={subscribe}>Subscribe</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SocketProvider", () => {
  it("creates a websocket connection and exposes generic emit/on helpers", () => {
    render(
      <SocketProvider>
        <SocketConsumer />
      </SocketProvider>
    );

    fireEvent.click(document.querySelector("button")!);

    expect(mockOn).toHaveBeenCalledWith("connect_error", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("metric:refreshed", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("metric:refreshed", expect.any(Function));
    expect(mockEmit).toHaveBeenCalledWith("dashboard:subscribe", {
      dashboard: "operating",
    });
  });

  it("cleans up socket listeners on unmount", () => {
    const { unmount } = render(
      <SocketProvider>
        <div>Test</div>
      </SocketProvider>
    );

    unmount();

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
