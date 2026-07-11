import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AopsCockpitTranslationKey } from "../../lib/i18n";

const KINDS: { id: string; key: AopsCockpitTranslationKey }[] = [
  { id: "message", key: "chatKindMessage" },
  { id: "directive", key: "chatKindDirective" },
  { id: "question", key: "chatKindQuestion" },
  { id: "decision", key: "chatKindDecision" },
  { id: "status", key: "chatKindStatus" }
];

interface MessageComposerProps {
  disabled?: boolean;
  onSend: (text: string, kind: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}

// Command-bar composer: kind token + prompt + mono textarea + send. The send
// behavior stays the same: click or Cmd/Ctrl+Enter.
export function MessageComposer({ disabled, onSend, t }: MessageComposerProps): ReactNode {
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState("message");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend(text, kind);
  };

  const activeKind = KINDS.find((entry) => entry.id === kind) ?? KINDS[0];

  return (
    <div className={`aops-v2-composer${disabled ? " is-disabled" : ""}`}>
      <div className="aops-v2-composer-bar">
        <div className="aops-v2-composer-kindwrap" ref={menuRef}>
          <button
            type="button"
            className="aops-v2-composer-kind"
            aria-label={t("chatComposerKindLabel")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {t(activeKind.key)}
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="aops-v2-composer-kindmenu" role="menu">
              {KINDS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={kind === entry.id}
                  className={kind === entry.id ? "is-active" : ""}
                  onClick={() => {
                    setKind(entry.id);
                    setMenuOpen(false);
                  }}
                >
                  {t(entry.key)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="aops-v2-composer-prompt" aria-hidden>›</span>
        <textarea
          className="aops-v2-composer-box"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("chatComposerPlaceholder")}
          rows={1}
        />
        <span className="aops-v2-composer-enc" title={t("chatComposerEnc")}>
          {t("chatEncryptionE2eShort")}
        </span>
        <kbd className="aops-v2-composer-hint" aria-hidden>⌘↵</kbd>
        <button
          type="button"
          className="aops-v2-composer-send"
          onClick={submit}
          disabled={disabled}
          aria-label={t("chatComposerSend")}
          title={t("chatComposerSend")}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M3 10l14-6-4 14-3-5-7-3z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="currentColor"
              fillOpacity="0.12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
