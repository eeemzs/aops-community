import { useEffect, useState, type ReactNode } from "react";
import type {
  ChannelMember,
  DecryptedMessage,
  Receipt
} from "@aopslab/domain-product-client-chatv3";
import type { DirectiveAck } from "../../lib/chat";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../../lib/i18n";
import { avatarColor, initials } from "./avatar";

const KIND_LABEL_KEY: Partial<Record<string, AopsCockpitTranslationKey>> = {
  message: "chatKindMessage",
  directive: "chatKindDirective",
  question: "chatKindQuestion",
  decision: "chatKindDecision",
  status: "chatKindStatus"
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bcp47(locale: AopsCockpitLocale): string {
  return locale === "tr" ? "tr-TR" : "en-US";
}

function kindTagClass(kind: string): string {
  if (kind === "directive") return "is-directive";
  if (kind === "status" || kind === "handoff") return "is-status";
  if (kind === "question" || kind === "decision" || kind === "answer") return "is-decision";
  return "is-neutral";
}

function kindLabel(
  kind: string,
  loc: string,
  t: (key: AopsCockpitTranslationKey, ...args: string[]) => string
): string {
  const key = KIND_LABEL_KEY[kind];
  return (key ? t(key) : kind).toLocaleUpperCase(loc);
}

interface MessageTimelineProps {
  messages: DecryptedMessage[];
  resolveMember: (memberId: string) => ChannelMember | undefined;
  receipts?: Receipt[];
  myHandle: string | null;
  roomLabel?: string | null;
  directiveAck?: DirectiveAck | null;
  onAckDirective?: (seq: number) => void;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey, ...args: string[]) => string;
}

// Grouped E2E timeline: command-console log rows with copyable seq refs,
// sender identity, mono tags, own/directive tint, unread/day dividers, and
// cursor-derived read/delivered receipts.
export function MessageTimeline({
  messages,
  resolveMember,
  receipts = [],
  myHandle,
  roomLabel,
  directiveAck,
  onAckDirective,
  locale,
  t
}: MessageTimelineProps): ReactNode {
  const loc = bcp47(locale);
  const [copiedSeq, setCopiedSeq] = useState<number | null>(null);

  const dayLabel = (d: Date): string => {
    const now = new Date();
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const key = dayKey(d);
    const date = d.toLocaleDateString(loc, { day: "numeric", month: "short" });
    if (key === today) return `${t("chatDayToday")} · ${date}`;
    if (key === yesterday) return `${t("chatDayYesterday")} · ${date}`;
    return date;
  };
  const timeLabel = (d: Date): string =>
    d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (copiedSeq == null) return undefined;
    const timer = window.setTimeout(() => setCopiedSeq(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedSeq]);

  const copyMessageRef = (seq: number) => {
    const ref = `chatv3:${roomLabel || "room"}#${seq}`;
    void navigator.clipboard
      ?.writeText(ref)
      .then(() => setCopiedSeq(seq))
      .catch(() => undefined);
  };

  const renderSeqButton = (seq: number): ReactNode => (
    <button
      type="button"
      className={`aops-v2-msg-seq${copiedSeq === seq ? " is-copied" : ""}`}
      onClick={() => copyMessageRef(seq)}
      title={copiedSeq === seq ? t("chatCopied") : t("chatCopyRef")}
      aria-label={t("chatCopyRef")}
    >
      #{seq}
    </button>
  );

  if (messages.length === 0) {
    return <div className="aops-v2-msg-empty">{t("chatEmpty")}</div>;
  }

  const myReadSeq = myHandle
    ? receipts.find((r) => r.handle === myHandle)?.lastReadSeq
    : undefined;
  const firstUnreadSeq =
    myReadSeq == null ? null : messages.find((m) => m.seq > myReadSeq)?.seq ?? null;

  return (
    <div className="aops-v2-msg-timeline">
      {messages.map((m, i) => {
        const member = resolveMember(m.senderMemberId);
        const handle = member?.handle ?? m.senderMemberId.slice(0, 8);
        const at = new Date(m.createdAt);
        const prev = messages[i - 1];
        const prevAt = prev ? new Date(prev.createdAt) : null;
        const newDay = !prevAt || dayKey(prevAt) !== dayKey(at);
        const grouped =
          !newDay &&
          !!prev &&
          prev.senderMemberId === m.senderMemberId &&
          at.getTime() - (prevAt as Date).getTime() < GROUP_WINDOW_MS;
        const mine = !!myHandle && member?.handle === myHandle;
        const locked = m.text === "[locked]";
        // Read by any other member whose read cursor reached this seq (derived
        // from room cursors, not per-message state).
        const others = receipts.filter((r) => r.memberId !== m.senderMemberId);
        const readers = others.filter((r) => r.lastReadSeq >= m.seq).map((r) => r.handle);
        const deliveredOnly = others
          .filter((r) => r.lastReadSeq < m.seq && r.deliveredSeq >= m.seq)
          .map((r) => r.handle);
        const isLatestDirective =
          m.kind === "directive" && !!directiveAck && directiveAck.seq === m.seq;
        return (
          <div key={m.seq}>
            {newDay && <div className="aops-v2-msg-daybar">{dayLabel(at)}</div>}
            {firstUnreadSeq === m.seq && (
              <div className="aops-v2-msg-unreadbar">{t("chatUnreadDivider")}</div>
            )}
            <div
              className={`aops-v2-msg${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}${m.kind !== "message" ? ` is-kind-${m.kind}` : ""}`}
            >
              <span className="aops-v2-msg-seqcol">{renderSeqButton(m.seq)}</span>
              {grouped ? (
                <span className="aops-v2-msg-gutter" aria-hidden />
              ) : (
                <span
                  className="aops-v2-msg-avatar"
                  style={{ background: avatarColor(handle) }}
                  aria-hidden
                >
                  {initials(handle)}
                </span>
              )}
              <div className="aops-v2-msg-body">
                {!grouped && (
                  <div className="aops-v2-msg-head">
                    <span className="aops-v2-msg-handle" style={{ color: avatarColor(handle) }}>
                      {handle}
                    </span>
                    {member?.actorKind && member.actorKind !== "human" && (
                      <span className="aops-v2-msg-tag is-agent">
                        {member.actorKind.toLocaleUpperCase(loc)}
                      </span>
                    )}
                    {m.kind !== "message" && (
                      <span className={`aops-v2-msg-tag ${kindTagClass(m.kind)}`}>
                        {kindLabel(m.kind, loc, t)}
                      </span>
                    )}
                    {mine && (
                      <span className="aops-v2-msg-tag is-you">
                        {t("chatYou").toLocaleUpperCase(loc)}
                      </span>
                    )}
                    <span className="aops-v2-msg-head-spacer" aria-hidden />
                    <span className="aops-v2-msg-time">{timeLabel(at)}</span>
                  </div>
                )}
                {grouped && (
                  <div className="aops-v2-msg-minihead">
                    {m.kind !== "message" && (
                      <span className={`aops-v2-msg-tag ${kindTagClass(m.kind)}`}>
                        {kindLabel(m.kind, loc, t)}
                      </span>
                    )}
                    {mine && (
                      <span className="aops-v2-msg-tag is-you">
                        {t("chatYou").toLocaleUpperCase(loc)}
                      </span>
                    )}
                    <span className="aops-v2-msg-head-spacer" aria-hidden />
                    <span className="aops-v2-msg-time">{timeLabel(at)}</span>
                  </div>
                )}
                <div className={`aops-v2-msg-text${locked ? " is-locked" : ""}`}>
                  {locked ? t("chatLockedHint") : m.text}
                </div>
                {isLatestDirective && directiveAck && (
                  <div className="aops-v2-msg-ack">
                    {directiveAck.mine ? (
                      <span className="aops-v2-msg-ack-done">
                        ✓ {t("chatAcknowledged")} · {directiveAck.acked}/{directiveAck.total}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="aops-v2-msg-ack-btn"
                          onClick={() => onAckDirective?.(m.seq)}
                        >
                          {t("chatAckShort")} {directiveAck.acked}/{directiveAck.total}
                        </button>
                        <span className="aops-v2-msg-ack-note">· {t("chatActivityPending")}</span>
                      </>
                    )}
                  </div>
                )}
                {readers.length > 0 && (
                  <div className="aops-v2-msg-receipt">
                    ✓✓ {t("chatRead")} · {readers.join(", ")}
                  </div>
                )}
                {deliveredOnly.length > 0 && (
                  <div className="aops-v2-msg-receipt is-delivered">
                    ✓ {t("chatDelivered")} · {deliveredOnly.join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
