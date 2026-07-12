import { useEffect, useRef, useState, type ReactNode } from "react";

type CopyState = "idle" | "copied" | "error";

async function writeClipboard(text: string): Promise<void> {
  const textarea = window.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  let copiedByGesture = false;
  try {
    window.document.body.appendChild(textarea);
    textarea.select();
    copiedByGesture = window.document.execCommand("copy");
  } catch {
    // Continue with the modern Clipboard fallback below.
  } finally {
    textarea.remove();
  }
  if (copiedByGesture) return;

  if (window.navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        window.navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("clipboard_timeout")), 400)
        )
      ]);
      return;
    } catch {
      // Trusted desktop shells may expose Clipboard without granting the web
      // permission; report failure after both supported paths have been tried.
    }
  }
  throw new Error("clipboard_unavailable");
}

function CopyIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5 12.5 4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyContentButton({
  text,
  copyLabel,
  copiedLabel,
  failedLabel
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
}): ReactNode {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    },
    []
  );

  const copy = async () => {
    if (!text) return;
    try {
      await writeClipboard(text);
      setState("copied");
    } catch {
      setState("error");
    }
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setState("idle"), 1800);
  };
  const label = state === "copied" ? copiedLabel : state === "error" ? failedLabel : copyLabel;

  return (
    <button
      type="button"
      className="aops-content-copy-button"
      data-state={state}
      disabled={!text}
      aria-label={label}
      title={label}
      onClick={() => void copy()}
    >
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
