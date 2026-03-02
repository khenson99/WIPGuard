"use client";

import { useEffect, useRef } from "react";

interface DismissUndoToastProps {
  insightTitle: string;
  onUndo: () => void;
  onClose: () => void;
  durationMs?: number;
}

export function DismissUndoToast({
  insightTitle,
  onUndo,
  onClose,
  durationMs = 5000,
}: DismissUndoToastProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  function handleUndo() {
    onUndo();
    onClose();
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
    >
      <span className="max-w-[240px] truncate">
        Dismissed &ldquo;{insightTitle}&rdquo;
      </span>
      <button
        type="button"
        onClick={handleUndo}
        className="shrink-0 font-semibold underline text-blue-300 hover:text-blue-200 dark:text-blue-600 dark:hover:text-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
      >
        Undo
      </button>
    </div>
  );
}
