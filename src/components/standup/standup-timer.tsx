"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";

interface StandupTimerProps {
  /** Called once when timer is first started */
  onStart?: () => void;
  /** Called when timer is stopped / standup ends */
  onStop?: (elapsedSeconds: number) => void;
  /** Facilitator mode: larger display for screen-share */
  facilitatorMode?: boolean;
}

export function StandupTimer({
  onStart,
  onStop,
  facilitatorMode = false,
}: StandupTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second while running
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const handleStart = useCallback(() => {
    if (!started) {
      setStarted(true);
      onStart?.();
    }
    setRunning(true);
  }, [started, onStart]);

  const handlePause = useCallback(() => {
    setRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    setRunning(false);
    if (started && elapsed > 0) onStop?.(elapsed);
    setElapsed(0);
    setStarted(false);
  }, [started, elapsed, onStop]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Color coding: green < 10 min, amber 10-15 min, red > 15 min
  const timerColor =
    elapsed < 600
      ? "text-emerald-500"
      : elapsed < 900
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3",
        facilitatorMode && "px-6 py-5",
      )}
    >
      <Timer
        className={clsx("h-5 w-5 text-muted-foreground", facilitatorMode && "h-7 w-7")}
        aria-hidden="true"
      />
      <span
        className={clsx(
          "font-mono font-bold tabular-nums",
          timerColor,
          facilitatorMode ? "text-4xl" : "text-xl",
        )}
        aria-live="polite"
        aria-label={`${minutes} minutes ${seconds} seconds`}
      >
        {display}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        {!running ? (
          <button
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Start standup timer"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {started ? "Resume" : "Start"}
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Pause standup timer"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            Pause
          </button>
        )}

        <button
          onClick={handleReset}
          disabled={!started}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Reset standup timer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset
        </button>
      </div>
    </div>
  );
}
