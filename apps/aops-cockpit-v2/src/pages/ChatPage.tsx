import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode
} from "react";
import {
  WorkbenchDetailTabs
} from "@aopslab/xf-ui-composition-react";
import {
  WorkbenchStatePanel
} from "@aopslab/xf-ui-shell-react";
import type { AopsCockpitLocale, AopsCockpitTranslationKey } from "../lib/i18n";
import { slugifyName, type ChatSession } from "../lib/chat";
import type { ChatNavigator } from "../lib/chatNavigator";
import { useCockpitViewport } from "../lib/viewport";
import { MessageTimeline } from "../components/chat/MessageTimeline";
import { MessageComposer } from "../components/chat/MessageComposer";
import { avatarColor, initials } from "../components/chat/avatar";
import { CockpitPanelCloseIcon, CockpitViewIcon } from "../components/CockpitViewIconSwitch";

export type { ChatSession } from "../lib/chat";

interface ChatPageProps {
  model: ChatSession;
  // Built at App level so the two-level channel/room tree can later render either
  // inline (left-menu split, the S2 default) or shell-attached (navigator dock).
  navigator: ChatNavigator;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
}

function statusKey(status: ChatSession["status"]): AopsCockpitTranslationKey {
  switch (status) {
    case "connecting":
      return "chatStatusConnecting";
    case "connected":
      return "chatStatusConnected";
    case "error":
      return "chatStatusError";
    default:
      return "chatStatusIdle";
  }
}

function ToolbarSearchIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ToolbarClearIcon(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChatSelectionGlyph({ checked = false }: { checked?: boolean }): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.5" />
      {checked ? (
        <path d="m4.8 8 2 2 4.4-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

function ChatArchiveGlyph(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.4 4.3h11.2v8.5H2.4zM1.8 2.2h12.4v2.2H1.8zM6 7h4" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ChatTrashGlyph(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 4.3h9M6 4.3V2.8h4v1.5m1.5 0-.6 9H5.1l-.6-9M6.6 6.5v4.8m2.8-4.8v4.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatCopyIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChatCheckIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatMoreIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

// Sessions > Chat. Left = the two-level channel/room navigator. Right = the
// active room pane (S3 fills in the message timeline / receipts / composer).
// A minimal create/join affordance lets the
// operator populate the navigator; full CRUD (room create, delete, rename,
// archive, member management) arrives in S4.
export function ChatPage({ model, navigator, locale, t }: ChatPageProps): ReactNode {
  const isMobileViewport = useCockpitViewport().viewport === "mobile";
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectInitialMode, setConnectInitialMode] = useState<"create" | "join">("create");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [mobileNavigatorOpen, setMobileNavigatorOpen] = useState(
    isMobileViewport && !model.activeRoomId
  );
  const mobileNavigatorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chatMainRef = useRef<HTMLElement | null>(null);

  const closeMobileNavigator = (restoreFocus = true) => {
    setMobileNavigatorOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileNavigatorTriggerRef.current?.focus());
    }
  };

  const openMobileNavigator = () => {
    setMobileNavigatorOpen(true);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(".aops-v2-chat-console-nav button")?.focus()
    );
  };

  useEffect(() => {
    if (!mobileNavigatorOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMobileNavigator();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavigatorOpen]);

  const openConnect = (mode: "create" | "join" = "create") => {
    setConnectInitialMode(mode);
    setConnectOpen(true);
  };

  // Read-only: list the hosted space directory once so the route proves live
  // connectivity to ChatV3 (the channel list is loaded by the hook's session
  // restore + space selection).
  useEffect(() => {
    void model.refreshAdminSpaces();
    // refreshAdminSpaces is a stable useCallback from the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRoom = model.activeRoomId
    ? model.rooms.find((room) => room.id === model.activeRoomId) ?? null
    : null;
  const selectedChannel = model.channelId
    ? model.channels.find((channel) => channel.id === model.channelId) ?? null
    : null;
  const lockedChannel =
    selectedChannel &&
    selectedChannel.status !== "archived" &&
    !selectedChannel.memberToken &&
    !selectedChannel.localCryptoAvailable
      ? selectedChannel
      : null;
  const hasChannels = model.channels.length > 0;
  const totalRooms = model.channels.reduce((sum, channel) => sum + (channel.rooms?.length ?? 0), 0) || model.rooms.length;

  // Navigator card holds only the tree now — channel/room creation is a modal
  // launched from the toolbar (works in both nav modes).
  // Empty-state shown in the detail area when no room is active (an active room
  // renders ChatRoomDetail instead).
  let detail: ReactNode = null;
  if (lockedChannel) {
    detail = (
      <ChatLockedChannelPanel
        channel={lockedChannel}
        model={model}
        t={t}
        onPasteInvite={() => openConnect("join")}
      />
    );
  } else if (model.channelId) {
    detail = (
      <WorkbenchStatePanel
        variant="empty"
        title={t("chatNoRoomTitle")}
        message={t("chatNoRoomMessage")}
      />
    );
  } else {
    detail = (
      <WorkbenchStatePanel
        variant="empty"
        title={hasChannels ? t("chatConnectTitle") : t("chatConnectPanelTitle")}
        message={t("chatConnectMessage")}
        actions={
          !hasChannels ? (
            <button
              type="button"
              className="aops-v2-secondary-button"
              onClick={() => openConnect("create")}
            >
              + {t("chatNewChannel")}
            </button>
          ) : undefined
        }
      />
    );
  }

  // A1 record-detail workbench (eops Partner Details parity): the shared
  // WorkbenchRecordDetailLayout hosts the channel/room navigator (left-menu mode)
  // + the room detail (record header + tab bar + tab content). In navigator/dock
  // mode the tree is shell-attached and the layout shows only the detail.
  return (
    <div
      className="aops-v2-chat-console-page"
      data-mobile-navigator-open={mobileNavigatorOpen ? "true" : "false"}
      data-side-panel-open={navigator.controller.open ? "true" : "false"}
    >
      {model.error ? (
        <p className="aops-v2-chat-error" role="alert">
          {model.error}
        </p>
      ) : null}
      <ChatConsoleToolbar
        status={model.status}
        channelCount={model.channels.length}
        roomCount={totalRooms}
        canCreateRoom={Boolean(model.channelId)}
        onCreateChannel={() => openConnect("create")}
        onCreateRoom={() => setCreateRoomOpen(true)}
        onOpenNavigator={openMobileNavigator}
        sidePanelOpen={navigator.controller.open}
        onToggleSidePanel={() => navigator.controller.setOpen((current) => !current)}
        navigatorTriggerRef={mobileNavigatorTriggerRef}
        t={t}
      />
      {navigator.bulkDialog}
      <div className="aops-v2-chat-console-shell">
        <button
          type="button"
          className="aops-v2-chat-mobile-nav-backdrop"
          aria-label={t("chatBackToChannels")}
          aria-hidden={mobileNavigatorOpen ? undefined : true}
          tabIndex={mobileNavigatorOpen ? 0 : -1}
          onClick={() => closeMobileNavigator()}
        />
        <ChatConsoleNavigator
          model={model}
          navigator={navigator}
          t={t}
          onCreateChannel={() => openConnect("create")}
          onJoinChannel={() => openConnect("join")}
          onClose={() => {
            if (isMobileViewport) closeMobileNavigator();
            else navigator.controller.setOpen(false);
          }}
          onSelectRoom={(roomId, channelId) => {
            void model.selectRoom(roomId, channelId);
            if (isMobileViewport) {
              closeMobileNavigator(false);
              window.requestAnimationFrame(() => chatMainRef.current?.focus());
            }
          }}
        />
        <main
          ref={chatMainRef}
          className="aops-v2-chat-console-main"
          aria-label={t("chatActiveRoom")}
          tabIndex={-1}
        >
          {activeRoom ? (
            <ChatRoomDetail
              model={model}
              locale={locale}
              t={t}
              onBackToNavigator={openMobileNavigator}
            />
          ) : (
            <div className="aops-v2-chat-detail-only">{detail}</div>
          )}
        </main>
      </div>
      {connectOpen ? (
        <ChatConnectModal
          model={model}
          t={t}
          initialMode={connectInitialMode}
          onClose={() => setConnectOpen(false)}
        />
      ) : null}
      {createRoomOpen && model.channelId ? (
        <ChatCreateRoomModal model={model} t={t} onClose={() => setCreateRoomOpen(false)} />
      ) : null}
    </div>
  );
}

function ChatConsoleToolbar({
  status,
  channelCount,
  roomCount,
  canCreateRoom,
  onCreateChannel,
  onCreateRoom,
  onOpenNavigator,
  sidePanelOpen,
  onToggleSidePanel,
  navigatorTriggerRef,
  t
}: {
  status: ChatSession["status"];
  channelCount: number;
  roomCount: number;
  canCreateRoom: boolean;
  onCreateChannel: () => void;
  onCreateRoom: () => void;
  onOpenNavigator: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  navigatorTriggerRef: RefObject<HTMLButtonElement | null>;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  return (
    <div className="aops-v2-chat-console-toolbar">
      <button
        type="button"
        className="aops-v2-chat-side-nav-trigger"
        onClick={onToggleSidePanel}
        aria-label={sidePanelOpen ? t("navSidePanelHide") : t("navSidePanelShow")}
        title={sidePanelOpen ? t("navSidePanelHide") : t("navSidePanelShow")}
        aria-pressed={sidePanelOpen}
        aria-expanded={sidePanelOpen}
        data-testid="aops-v2-chat-side-panel-toggle"
      >
        <CockpitViewIcon kind="side-panel" panelOpen={sidePanelOpen} />
      </button>
      <button
        ref={navigatorTriggerRef}
        type="button"
        className="aops-v2-chat-mobile-nav-trigger"
        onClick={onOpenNavigator}
        aria-label={t("chatNavReopen")}
        data-testid="chat-mobile-navigator-trigger"
      >
        <span aria-hidden>☰</span>
      </button>
      <span className={`aops-v2-chat-console-status is-${status}`}>
        {t(statusKey(status))}
      </span>
      <span className="aops-v2-chat-console-metric">
        {t("chatChannelsLabel")}: <b>{channelCount}</b>
      </span>
      <span className="aops-v2-chat-console-metric">
        {t("chatRoomsLabel")}: <b>{roomCount}</b>
      </span>
      <span className="aops-v2-chat-console-spacer" aria-hidden />
      <button type="button" className="aops-v2-chat-console-new" onClick={onCreateChannel}>
        + {t("chatNewChannel")}
      </button>
      <button
        type="button"
        className="aops-v2-chat-console-new is-secondary"
        disabled={!canCreateRoom}
        onClick={onCreateRoom}
      >
        + {t("chatNewRoom")}
      </button>
    </div>
  );
}

function ChatConsoleNavigator({
  model,
  navigator,
  t,
  onCreateChannel,
  onJoinChannel,
  onClose,
  onSelectRoom
}: {
  model: ChatSession;
  navigator: ChatNavigator;
  t: (key: AopsCockpitTranslationKey) => string;
  onCreateChannel: () => void;
  onJoinChannel: () => void;
  onClose: () => void;
  onSelectRoom: (roomId: string, channelId: string) => void;
}): ReactNode {
  const query = navigator.searchValue.trim().toLocaleLowerCase();
  const channelRows = model.channels
    .map((channel) => {
      const rooms = roomsForChannel(model, channel);
      const channelText = `${channel.title} ${channel.slug}`.toLocaleLowerCase();
      const visibleRooms = query
        ? rooms.filter((room) => `${room.title} ${room.slug}`.toLocaleLowerCase().includes(query))
        : rooms;
      const channelMatches = !query || channelText.includes(query) || visibleRooms.length > 0;
      return channelMatches ? { channel, rooms: visibleRooms.length ? visibleRooms : rooms } : null;
    })
    .filter((entry): entry is { channel: ChatSession["channels"][number]; rooms: ChatSession["rooms"] } => Boolean(entry));

  return (
    <aside className="aops-v2-chat-console-nav" aria-label={t("chatNavPanelTitle")}>
      <div className="aops-v2-chat-console-navhead">
        <span>
          {t("chatChannelsLabel")} <b>{model.channels.length}</b>
        </span>
        <span className="aops-v2-chat-console-navhead-actions">
          <button
            type="button"
            className={`aops-v2-chat-console-select-toggle${navigator.selectionMode ? " is-active" : ""}`}
            aria-label={navigator.selectionMode ? t("chatSelectionDone") : t("chatSelectChats")}
            title={navigator.selectionMode ? t("chatSelectionDone") : t("chatSelectChats")}
            aria-pressed={navigator.selectionMode}
            disabled={navigator.bulkBusy}
            onClick={navigator.selectionMode ? navigator.exitSelectionMode : navigator.enterSelectionMode}
            data-testid="aops-v2-chat-selection-toggle"
          >
            <ChatSelectionGlyph checked={navigator.selectionMode} />
          </button>
          <button
            type="button"
            className="aops-v2-chat-console-navgear"
            aria-label={t("navSidePanelClose")}
            title={t("navSidePanelClose")}
            onClick={onClose}
            data-testid="aops-v2-chat-console-nav-close"
          >
            <CockpitPanelCloseIcon />
          </button>
        </span>
      </div>
      <label className="aops-v2-chat-console-search">
        <span>{ToolbarSearchIcon()}</span>
        <input
          type="search"
          value={navigator.searchValue}
          onChange={(event) => navigator.onSearchChange(event.currentTarget.value)}
          placeholder={t("chatSearchPlaceholder")}
          aria-label={t("chatSearchPlaceholder")}
        />
        {navigator.searchValue ? (
          <button
            type="button"
            aria-label="Clear chat search"
            title="Clear chat search"
            onClick={() => navigator.onSearchChange("")}
          >
            {ToolbarClearIcon()}
          </button>
        ) : null}
      </label>
      {navigator.selectionMode ? (
        <div className="aops-v2-chat-console-bulkbar">
          <button
            type="button"
            className="aops-v2-chat-console-bulk-all"
            disabled={!model.channels.length || navigator.bulkBusy}
            onClick={navigator.selectAllChannels}
          >
            {t("chatSelectAll")}
          </button>
          <span className="aops-v2-chat-console-bulk-count" aria-live="polite">
            {navigator.selectedChannelCount} {t("chatSelected")}
          </span>
          <span className="aops-v2-chat-console-bulk-spacer" />
          <button
            type="button"
            className="aops-v2-chat-console-bulk-action"
            disabled={!navigator.selectedChannelCount || navigator.bulkBusy}
            title={t("chatArchiveSelected")}
            aria-label={t("chatArchiveSelected")}
            onClick={() => navigator.requestBulkAction("archive")}
            data-testid="aops-v2-chat-bulk-archive"
          >
            <ChatArchiveGlyph />
          </button>
          <button
            type="button"
            className="aops-v2-chat-console-bulk-action is-danger"
            disabled={!navigator.selectedChannelCount || navigator.selectedDeleteBlocked || navigator.bulkBusy}
            title={navigator.selectedDeleteBlocked ? t("chatBulkDeleteBlocked") : t("chatDeleteSelected")}
            aria-label={t("chatDeleteSelected")}
            onClick={() => navigator.requestBulkAction("delete")}
            data-testid="aops-v2-chat-bulk-delete"
          >
            <ChatTrashGlyph />
          </button>
        </div>
      ) : null}
      {navigator.bulkError ? <p className="aops-v2-chat-console-bulk-error" role="alert">{navigator.bulkError}</p> : null}
      <div className="aops-v2-chat-console-navlist">
        {channelRows.length ? (
          channelRows.map(({ channel, rooms }) => (
            <div
              key={channel.id}
              className={`aops-v2-chat-console-channel${channel.id === model.channelId ? " is-active" : ""}${channel.status === "archived" ? " is-archived" : ""}${navigator.selectedChannelIds.has(channel.id) ? " is-selected" : ""}`}
            >
              <button
                type="button"
                className="aops-v2-chat-console-channelbtn"
                onClick={() => navigator.selectionMode ? navigator.toggleChannelSelection(channel.id) : void model.selectChannel(channel.id)}
                role={navigator.selectionMode ? "checkbox" : undefined}
                aria-checked={navigator.selectionMode ? navigator.selectedChannelIds.has(channel.id) : undefined}
                aria-expanded={navigator.selectionMode ? undefined : channel.id === model.channelId || Boolean(query)}
                data-testid={navigator.selectionMode ? `aops-v2-chat-select-${channel.id}` : undefined}
              >
                {navigator.selectionMode ? (
                  <span className="aops-v2-chat-console-selectbox">
                    <ChatSelectionGlyph checked={navigator.selectedChannelIds.has(channel.id)} />
                  </span>
                ) : null}
                <span className="aops-v2-chat-console-channelavatar" style={{ background: avatarColor(channel.id || channel.slug) }}>
                  {initials(channel.title || channel.slug)}
                </span>
                <span className="aops-v2-chat-console-channelname" title={channel.title || channel.slug}>
                  {channel.title || channel.slug}
                </span>
                <span className="aops-v2-chat-console-count">{rooms.length}</span>
              </button>
              {!navigator.selectionMode && (channel.id === model.channelId || query) ? (
                <div className="aops-v2-chat-console-rooms">
                  {rooms.map((room) => (
                    <button
                      type="button"
                      key={room.id}
                      className={`aops-v2-chat-console-roombtn${room.id === model.activeRoomId ? " is-active" : ""}`}
                      onClick={() => onSelectRoom(room.id, channel.id)}
                    >
                      <span aria-hidden>#</span>
                      <span title={room.title || room.slug}>{room.title || room.slug}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="aops-v2-chat-console-navempty">
            <span>{query ? t("chatNoChannelsSearch") : t("chatNoChannelsNav")}</span>
            <button type="button" onClick={onCreateChannel}>{t("chatNewChannel")}</button>
            <button type="button" onClick={onJoinChannel}>{t("chatJoinChannel")}</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function roomsForChannel(
  model: ChatSession,
  channel: ChatSession["channels"][number]
): ChatSession["rooms"] {
  if (channel.id === model.channelId && model.rooms.length) return model.rooms;
  return channel.rooms ?? [];
}

function ChatLockedChannelPanel({
  channel,
  model,
  t,
  onPasteInvite
}: {
  channel: ChatSession["channels"][number];
  model: ChatSession;
  t: (key: AopsCockpitTranslationKey) => string;
  onPasteInvite: () => void;
}): ReactNode {
  const [pin, setPin] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const needsPin = channel.recoveryState === "locked-needs-pin";
  const pinError = pin.trim().length === 0 ? t("chatRecoveryPinRequired") : null;
  const showPinError = Boolean(pinError && submitted);
  const recoveryDiagnostic = channel.recoveryError ? (
    <p className="aops-v2-chat-recovery-error" role="alert">
      <strong>{t("chatRecoveryErrorLabel")}</strong> {channel.recoveryError}
    </p>
  ) : null;
  const unlockWithPin = () => {
    setSubmitted(true);
    if (pinError) return;
    void model.unlockChannelWithPin(channel.id, pin);
  };

  if (needsPin) {
    return (
      <WorkbenchStatePanel
        variant="empty"
        title={t("chatChannelPinLockedTitle")}
        message={t("chatChannelPinLockedMessage")}
        actions={
          <>
            {recoveryDiagnostic}
            <form
              className="aops-v2-chat-unlock-form"
              onSubmit={(event) => {
                event.preventDefault();
                unlockWithPin();
              }}
              noValidate
            >
              <label className="aops-v2-chat-field">
                <span>{t("chatRecoveryPinLabel")}</span>
                <input
                  type="password"
                  value={pin}
                  autoComplete="off"
                  aria-invalid={showPinError}
                  aria-describedby={showPinError ? "aops-chat-pin-error" : undefined}
                  onChange={(event) => setPin(event.currentTarget.value)}
                />
                {showPinError ? (
                  <span className="aops-field-error" id="aops-chat-pin-error">
                    {pinError}
                  </span>
                ) : null}
              </label>
              <div className="aops-v2-chat-connect-actions">
                <button type="submit" className="aops-v2-primary-button">
                  {t("chatUnlockWithPin")}
                </button>
                <button type="button" className="aops-v2-secondary-button" onClick={onPasteInvite}>
                  {t("chatPasteInvite")}
                </button>
              </div>
            </form>
          </>
        }
      />
    );
  }

  if (channel.recoveryState === "stale-needs-current-device") {
    return (
      <WorkbenchStatePanel
        variant="empty"
        title={t("chatChannelStaleTitle")}
        message={t("chatChannelStaleMessage")}
        actions={
          <>
            {recoveryDiagnostic}
            <button type="button" className="aops-v2-secondary-button" onClick={onPasteInvite}>
              {t("chatPasteInvite")}
            </button>
          </>
        }
      />
    );
  }

  if (channel.recoveryState === "recoverable") {
    return (
      <WorkbenchStatePanel
        variant="empty"
        title={t("chatChannelRecoverableTitle")}
        message={t("chatChannelRecoverableMessage")}
        actions={
          <>
            {recoveryDiagnostic}
            <button type="button" className="aops-v2-secondary-button" onClick={onPasteInvite}>
              {t("chatPasteInvite")}
            </button>
          </>
        }
      />
    );
  }

  return (
    <WorkbenchStatePanel
      variant="empty"
      title={t("chatChannelLockedTitle")}
      message={t("chatChannelLockedMessage")}
      actions={
        <>
          {recoveryDiagnostic}
          <button type="button" className="aops-v2-secondary-button" onClick={onPasteInvite}>
            {t("chatPasteInvite")}
          </button>
        </>
      }
    />
  );
}

// Modal chrome shared by the create-channel / create-room dialogs: backdrop +
// dialog + header (title + close ✕), Esc + backdrop-click to close.
function ChatModal({
  title,
  closeLabel,
  onClose,
  size,
  children
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  size?: "sm";
  children: ReactNode;
}): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="aops-v2-chat-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`aops-v2-chat-modal${size === "sm" ? " aops-v2-chat-modal-sm" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{title}</h4>
          <button
            type="button"
            className="aops-v2-chat-iconclose"
            aria-label={closeLabel}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="aops-v2-chat-modal-body">{children}</div>
      </div>
    </div>
  );
}

type ChatTabId = "messages" | "members" | "references" | "rules" | "activity";

// Active-room detail as an A1 record-detail workbench (eops Partner Details
// parity): a record header (channel/room identity + meta + presence strip) + a
// tab bar (Messages / Members / References / Rules / Activity) + the active tab
// body. R1 ships the shell + Messages/References/Rules; Members (R2) + Activity
// (R4) land next.
function ChatRoomDetail({
  model,
  locale,
  t,
  onBackToNavigator
}: {
  model: ChatSession;
  locale: AopsCockpitLocale;
  t: (key: AopsCockpitTranslationKey) => string;
  onBackToNavigator: () => void;
}): ReactNode {
  const [activeTab, setActiveTab] = useState<ChatTabId>("messages");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "room" | "channel"; id: string; slug: string; label: string } | null
  >(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Scroll-to-latest once per (room, messages-tab entry).
  const scrolledKeyRef = useRef<string | null>(null);
  // Right-side members rail: narrow (avatars) <-> expanded (roster). UI-only
  // preference, persisted page-scoped per UI System v2 §8.7 / §11.2.
  const [railExpanded, setRailExpanded] = useState<boolean>(() => readMemberRailExpanded());
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCopyBusy, setInviteCopyBusy] = useState(false);

  const room = model.rooms.find((entry) => entry.id === model.activeRoomId) ?? null;
  const activeChannel = model.channels.find((entry) => entry.id === model.channelId) ?? null;
  const canCopyInvite = Boolean(model.invite);
  const messageCount = model.messages.length;
  useLayoutEffect(() => {
    if (activeTab !== "messages") {
      // The scroller unmounts with the tab; re-arm so returning to Messages
      // lands on the latest message again instead of the remounted top.
      scrolledKeyRef.current = null;
      return;
    }
    const el = scrollRef.current;
    if (!el || !model.activeRoomId) return;
    const key = `${model.activeRoomId}`;
    if (scrolledKeyRef.current !== key && messageCount > 0) {
      el.scrollTop = el.scrollHeight;
      scrolledKeyRef.current = key;
    }
  }, [model.activeRoomId, messageCount, activeTab]);

  useEffect(() => {
    if (!inviteCopied) return undefined;
    const timer = window.setTimeout(() => setInviteCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [inviteCopied]);

  if (!room) return null;

  const channelRules = activeChannel?.guidanceMarkdown?.trim() || "";
  const roomRules = room.guidanceMarkdown?.trim() || "";
  const presenceRows = chatPresenceRows(model);
  const onlineCount = presenceRows.filter((row) => isOnlineState(row.state)).length;
  const channelPath = model.channelTitle || activeChannel?.title || activeChannel?.slug || t("chatChannelSection");
  const roomPath = room.title || room.slug;
  const roomTitle = room.title || room.slug;

  const copyInvite = async () => {
    if (inviteCopyBusy || !canCopyInvite) return;
    setInviteCopyBusy(true);
    try {
      const invite = model.invite;
      if (!invite) return;
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(invite);
      setInviteCopied(true);
    } catch {
      // The session action already exposes server errors through model.error.
    } finally {
      setInviteCopyBusy(false);
    }
  };

  const tabs = [
    { id: "messages", label: t("chatTabMessages"), count: messageCount || null },
    { id: "members", label: t("chatTabMembers"), count: model.members.length || null },
    { id: "references", label: t("chatTabReferences"), count: model.bindings.length || null },
    { id: "rules", label: t("chatTabRules") },
    { id: "activity", label: t("chatTabActivity") }
  ];

  return (
    <section className="aops-v2-chat-record" aria-label={t("chatActiveRoom")}>
      <header className="aops-v2-chat-rechead">
        <button
          type="button"
          className="aops-v2-chat-mobile-back"
          onClick={onBackToNavigator}
          aria-label={t("chatBackToChannels")}
        >
          <span aria-hidden>←</span>
        </button>
        <div className="aops-v2-chat-rechead-id">
          <h3 className="aops-v2-chat-rechead-path" title={roomTitle}>
            <span className="aops-v2-chat-rechead-eyebrow">{channelPath}</span>
            <span className="aops-v2-chat-rechead-sep"> / </span>
            <span className="aops-v2-chat-rechead-hash">#</span>
            <span className="aops-v2-chat-rechead-room">{roomPath}</span>
          </h3>
          <div className="aops-v2-chat-rechead-chips" aria-label={t("chatActiveRoom")}>
            {activeChannel?.encryptionMode === "e2e" ? (
              <span className="aops-v2-chat-headchip is-e2e">{t("chatEncryptionE2eShort")}</span>
            ) : null}
            <span className="aops-v2-chat-headchip is-epoch">
              {t("chatEpochShort")} {room.currentEpoch}
            </span>
          </div>
        </div>
        <div className="aops-v2-chat-rechead-summary" aria-label={t("chatMembersOnline")}>
          <span>
            {presenceRows.length} {t("chatTabMembers")}
          </span>
          <span aria-hidden>·</span>
          <span>
            <b>{onlineCount}</b> {t("chatPresenceOnline")}
          </span>
        </div>
        <div className="aops-v2-chat-rechead-actions">
          <button
            type="button"
            className={`aops-v2-chat-copybtn${inviteCopied ? " is-copied" : ""}`}
            disabled={!canCopyInvite || inviteCopyBusy}
            data-state={inviteCopied ? "copied" : inviteCopyBusy ? "busy" : "idle"}
            aria-label={inviteCopied ? t("chatInviteCopied") : t("chatCopyInvite")}
            title={inviteCopied ? t("chatInviteCopied") : model.invite ? t("chatCopyInvite") : t("chatInviteUnavailable")}
            onClick={() => void copyInvite()}
          >
            {inviteCopied ? ChatCheckIcon() : ChatCopyIcon()}
          </button>
          <ChatRoomActionsMenu
            open={actionsOpen}
            onToggle={() => setActionsOpen((open) => !open)}
            onClose={() => setActionsOpen(false)}
            isGeneralRoom={room.slug === "general"}
            channelArchived={activeChannel?.status === "archived"}
            canDeleteChannel={activeChannel?.canDelete ?? true}
            invite={model.invite}
            inviteCopied={inviteCopied}
            inviteCopyBusy={inviteCopyBusy}
            t={t}
            onCopyInvite={() => void copyInvite()}
            onArchiveRoom={() => {
              setActionsOpen(false);
              void model.archiveRoom(room.id);
            }}
            onDeleteRoom={() => {
              setActionsOpen(false);
              setDeleteTarget({ kind: "room", id: room.id, slug: room.slug, label: room.title || room.slug });
            }}
            onArchiveChannel={() => {
              setActionsOpen(false);
              if (model.channelId) void model.archiveChannel(model.channelId);
            }}
            onUnarchiveChannel={() => {
              setActionsOpen(false);
              if (model.channelId) void model.unarchiveChannel(model.channelId);
            }}
            onDeleteChannel={() => {
              setActionsOpen(false);
              if (activeChannel) {
                setDeleteTarget({
                  kind: "channel",
                  id: activeChannel.id,
                  slug: activeChannel.slug,
                  label: activeChannel.title || activeChannel.slug
                });
              }
            }}
            onLeaveChannel={() => {
              setActionsOpen(false);
              void model.leaveChannel();
            }}
          />
        </div>
      </header>

      <WorkbenchDetailTabs
        className="aops-v2-chat-tabs"
        items={tabs}
        activeId={activeTab}
        onChange={(id: string) => setActiveTab(id as ChatTabId)}
        ariaLabel={t("chatTitle")}
      />

      <div className="aops-v2-chat-tabbody">
        {activeTab === "messages" ? (
          <div className="aops-v2-chat-msglayout">
            <div className="aops-v2-chat-msgcol">
              <div className="aops-v2-chat-scroll" ref={scrollRef}>
                <MessageTimeline
                  messages={model.messages}
                  resolveMember={model.resolveMember}
                  receipts={model.receipts}
                  myHandle={model.handle}
                  roomLabel={room.slug}
                  directiveAck={model.directiveAck}
                  onAckDirective={(seq) => void model.ackDirective(seq)}
                  locale={locale}
                  t={t}
                />
              </div>
              <MessageComposer
                disabled={model.status === "connecting"}
                onSend={(text, kind) => void model.send(text, kind)}
                t={t}
              />
            </div>
            <ChatMembersRail
              model={model}
              expanded={railExpanded}
              onToggle={() =>
                setRailExpanded((prev) => {
                  writeMemberRailExpanded(!prev);
                  return !prev;
                })
              }
              t={t}
            />
          </div>
        ) : activeTab === "references" ? (
          <div className="aops-v2-chat-tabscroll">
            <ChatRefsPanel bindings={model.bindings} t={t} />
          </div>
        ) : activeTab === "rules" ? (
          <div className="aops-v2-chat-tabscroll">
            <ChatRulesTabBody channelRules={channelRules} roomRules={roomRules} t={t} />
          </div>
        ) : activeTab === "members" ? (
          <div className="aops-v2-chat-tabscroll">
            <ChatMembersTab model={model} t={t} />
          </div>
        ) : (
          <div className="aops-v2-chat-tabscroll">
            <ChatActivityTab model={model} room={room} t={t} />
          </div>
        )}
      </div>

      {deleteTarget ? (
        <ChatConfirmDeleteModal
          target={deleteTarget}
          t={t}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target.kind === "room") void model.deleteRoom(target.id, target.slug);
            else void model.deleteChannel(target.id, target.slug);
          }}
        />
      ) : null}
    </section>
  );
}

// Rules tab body — channel + room guidance, inline (the old modal content).
function ChatRulesTabBody({
  channelRules,
  roomRules,
  t
}: {
  channelRules: string;
  roomRules: string;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  return (
    <div className="aops-v2-chat-rules">
      <section>
        <h5>{t("chatRulesChannel")}</h5>
        {channelRules ? (
          <pre className="aops-v2-chat-rules-text">{channelRules}</pre>
        ) : (
          <p className="aops-v2-chat-muted">{t("chatRulesEmpty")}</p>
        )}
      </section>
      <section>
        <h5>{t("chatRulesRoom")}</h5>
        {roomRules ? (
          <pre className="aops-v2-chat-rules-text">{roomRules}</pre>
        ) : (
          <p className="aops-v2-chat-muted">{t("chatRulesEmpty")}</p>
        )}
      </section>
    </div>
  );
}

// Presence helpers (ported from the old cockpit MemberInspector). Presence is
// per-room from the hook's `presence` cursors; a member is "online" when their
// non-expired presence state isn't offline/none.
function memberPresenceState(model: ChatSession, memberId: string): string {
  const entry = model.presence.find((p) => p.memberId === memberId && !p.expired);
  return entry?.state ?? "offline";
}
function isOnlineState(state: string): boolean {
  return Boolean(state) && state !== "offline" && state !== "none";
}
function presenceDotClass(state: string): string {
  if (state === "active") return "is-active";
  if (isOnlineState(state)) return "is-busy";
  return "";
}
function presenceLabel(state: string, t: (key: AopsCockpitTranslationKey) => string): string {
  if (state === "active") return t("chatPresenceActive");
  if (state === "idle") return t("chatPresenceIdle");
  if (!isOnlineState(state)) return t("chatPresenceOffline");
  return state;
}

type ChatPresenceRow = {
  id: string;
  handle: string;
  actorKind?: string;
  state: string;
};

function chatPresenceRows(model: ChatSession): ChatPresenceRow[] {
  const base = model.members.length
    ? model.members.map((m) => ({ id: m.id, handle: m.handle, actorKind: m.actorKind }))
    : model.receipts.map((r) => ({ id: r.memberId, handle: r.handle, actorKind: r.actorKind }));
  return base
    .map((m) => ({ ...m, state: memberPresenceState(model, m.id) }))
    .sort((a, b) => {
      const onlineDelta = Number(isOnlineState(b.state)) - Number(isOnlineState(a.state));
      if (onlineDelta !== 0) return onlineDelta;
      return a.handle.localeCompare(b.handle);
    });
}

const MEMBER_RAIL_KEY = "aops-cockpit-v2.chat.memberRail.expanded";
function readMemberRailExpanded(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return true;
  try {
    return window.localStorage.getItem(MEMBER_RAIL_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeMemberRailExpanded(value: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(MEMBER_RAIL_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

// Right-side members rail on the Messages tab: a collapsible presence panel
// (narrow avatar rail <-> expanded roster) beside the conversation — the old
// cockpit participants panel, re-surfaced. Online members sort first.
function ChatMembersRail({
  model,
  expanded,
  onToggle,
  t
}: {
  model: ChatSession;
  expanded: boolean;
  onToggle: () => void;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  const rows = chatPresenceRows(model);

  if (!rows.length) return null;

  const onlineRows = rows.filter((m) => isOnlineState(m.state));
  const offlineRows = rows.filter((m) => !isOnlineState(m.state));
  const renderMemberRow = (m: ChatPresenceRow): ReactNode => {
    const isSelf = m.handle === model.handle;
    const label = presenceLabel(m.state, t);
    const secondary = isSelf && isOnlineState(m.state)
      ? `${label} · ${t("chatMemberYou")}`
      : m.actorKind && m.actorKind !== "human"
        ? `${m.actorKind} · ${label}`
        : label;
    return (
      <li
        key={m.id}
        className={`aops-v2-chat-memberrail-row${isOnlineState(m.state) ? "" : " is-offline"}${isSelf ? " is-self" : ""}`}
        title={expanded ? undefined : `@${m.handle} - ${label}`}
      >
        <span className="aops-v2-chat-memberrail-avatarwrap">
          <span
            className="aops-v2-chat-memberrail-avatar"
            style={{ background: avatarColor(m.handle) }}
            aria-hidden
          >
            {initials(m.handle)}
          </span>
          <span
            className={`aops-v2-chat-memberrail-dot ${presenceDotClass(m.state)}`}
            aria-label={label}
          />
        </span>
        {expanded ? (
          <span className="aops-v2-chat-memberrail-info">
            <span className="aops-v2-chat-memberrail-name">@{m.handle}</span>
            <span className="aops-v2-chat-memberrail-pres">{secondary}</span>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <aside
      className={`aops-v2-chat-memberrail ${expanded ? "is-expanded" : "is-narrow"}`}
      aria-label={t("chatTabMembers")}
    >
      <div className="aops-v2-chat-memberrail-head">
        {expanded ? (
          <>
            <div className="aops-v2-chat-memberrail-summary">
              <span className="aops-v2-chat-memberrail-count">{onlineRows.length}</span>
              <span className="aops-v2-chat-memberrail-title">{t("chatPresenceOnline")}</span>
            </div>
            <div className="aops-v2-chat-memberrail-facepile" aria-hidden>
              {onlineRows.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  className="aops-v2-chat-memberrail-face"
                  style={{ background: avatarColor(m.handle) }}
                >
                  {initials(m.handle)}
                </span>
              ))}
            </div>
          </>
        ) : null}
        <button
          type="button"
          className="aops-v2-chat-memberrail-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? t("chatMemberRailCollapse") : t("chatMemberRailExpand")}
          title={expanded ? t("chatMemberRailCollapse") : t("chatMemberRailExpand")}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d={expanded ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {expanded ? (
        <div className="aops-v2-chat-memberrail-groups">
          <div className="aops-v2-chat-memberrail-group">
            <div className="aops-v2-chat-memberrail-grouplabel">
              {t("chatPresenceOnline")} · {onlineRows.length}
            </div>
            <ul className="aops-v2-chat-memberrail-list">
              {onlineRows.map(renderMemberRow)}
            </ul>
          </div>
          {offlineRows.length ? (
            <div className="aops-v2-chat-memberrail-group">
              <div className="aops-v2-chat-memberrail-grouplabel">
                {t("chatPresenceOffline")} · {offlineRows.length}
              </div>
              <ul className="aops-v2-chat-memberrail-list">
                {offlineRows.map(renderMemberRow)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="aops-v2-chat-memberrail-list">
          {rows.map(renderMemberRow)}
        </ul>
      )}
    </aside>
  );
}

// Members tab — the old cockpit MemberInspector roster, re-surfaced: presence
// dot + avatar + handle + role + cursor-derived receipt + (owner/operator) remove.
function ChatMembersTab({
  model,
  t
}: {
  model: ChatSession;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const myMember = model.members.find((m) => m.handle === model.handle);
  const canManage =
    Boolean(myMember) &&
    ["owner", "operator", "admin"].includes((myMember?.roleKey ?? "").toLowerCase());

  // Fall back to the receipt roster when members haven't loaded yet (RR 052a6ec9).
  const rows: Array<{
    id: string;
    handle: string;
    actorKind?: string;
    roleKey?: string;
    status?: string;
  }> = model.members.length
    ? model.members
    : model.receipts.map((r) => ({
        id: r.memberId,
        handle: r.handle,
        actorKind: r.actorKind,
        roleKey: r.roleKey,
        status: "active"
      }));

  const copyInvite = () => {
    if (!model.invite) return;
    void navigator.clipboard
      ?.writeText(model.invite)
      .then(() => setInviteCopied(true))
      .catch(() => undefined);
  };

  return (
    <section className="aops-v2-chat-members" aria-label={t("chatTabMembers")}>
      <ChatInviteBlock
        invite={model.invite}
        copied={inviteCopied}
        onCopy={copyInvite}
        t={t}
      />
      {rows.length ? (
        <ul className="aops-v2-chat-memberlist">
          {rows.map((m) => {
            const state = memberPresenceState(model, m.id);
            const receipt = model.receipts.find((r) => r.memberId === m.id);
            const isSelf = m.handle === model.handle;
            const removed = m.status === "removed";
            const role = [m.actorKind, m.roleKey].filter(Boolean).join(" · ");
            const receiptText = receipt
              ? receipt.lastReadSeq > 0
                ? `✓✓ ${t("chatMemberReadUpTo")} #${receipt.lastReadSeq}`
                : receipt.deliveredSeq > 0
                  ? `✓ ${t("chatMemberDeliveredUpTo")} #${receipt.deliveredSeq}`
                  : ""
              : "";
            return (
              <li key={m.id} className={`aops-v2-chat-memberrow${removed ? " is-removed" : ""}`}>
                <span
                  className={`aops-v2-chat-presdot ${presenceDotClass(state)}`}
                  title={presenceLabel(state, t)}
                  aria-label={presenceLabel(state, t)}
                />
                <span
                  className="aops-v2-chat-memberavatar"
                  style={{ background: avatarColor(m.handle) }}
                  aria-hidden
                >
                  {initials(m.handle)}
                </span>
                <div className="aops-v2-chat-memberinfo">
                  <span className="aops-v2-chat-membername">
                    @{m.handle}
                    {isSelf ? (
                      <span className="eops-chip eops-chip--coral cp-chip-xs">{t("chatMemberYou")}</span>
                    ) : null}
                  </span>
                  {role ? <span className="aops-v2-chat-muted">{role}</span> : null}
                  {receiptText ? (
                    <span className="aops-v2-chat-memberreceipt">{receiptText}</span>
                  ) : null}
                </div>
                {removed ? (
                  <span className="aops-v2-chat-muted">{t("chatMemberRemoved")}</span>
                ) : canManage && !isSelf ? (
                  confirmRemove === m.id ? (
                    <span className="aops-v2-chat-member-confirm">
                      <button
                        type="button"
                        className="aops-v2-chat-danger-button"
                        disabled={busy === m.id}
                        onClick={async () => {
                          setBusy(m.id);
                          try {
                            await model.removeMember(m.id);
                            // Only close the confirm on success; on failure the
                            // model records `error` and rethrows — keep the
                            // confirm open so the operator can retry.
                            setConfirmRemove(null);
                          } catch {
                            /* error surfaced via model.error; row stays actionable */
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        {busy === m.id ? t("chatStatusConnecting") : t("chatMemberRemove")}
                      </button>
                      <button
                        type="button"
                        className="aops-v2-secondary-button"
                        onClick={() => setConfirmRemove(null)}
                      >
                        {t("chatCancel")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="aops-v2-chat-headbtn"
                      title={t("chatMemberRemoveConfirm")}
                      onClick={() => setConfirmRemove(m.id)}
                    >
                      {t("chatMemberRemove")}
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="aops-v2-chat-muted">{t("chatMembersEmpty")}</p>
      )}
      <div className="aops-v2-chat-members-foot">
        <button
          type="button"
          className="aops-v2-secondary-button"
          onClick={() => void model.leaveChannel()}
        >
          {t("chatLeaveChannel")}
        </button>
      </div>
    </section>
  );
}

// Activity tab — the live room pulse: latest-directive ACK rollup, a presence
// roster, and room/encryption metadata (the old MemberInspector "Room" section).
function ChatActivityTab({
  model,
  room,
  t
}: {
  model: ChatSession;
  room: ChatSession["rooms"][number];
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  const directive = model.directiveAck;
  const [inviteCopied, setInviteCopied] = useState(false);

  const copyInvite = () => {
    if (!model.invite) return;
    void navigator.clipboard
      ?.writeText(model.invite)
      .then(() => setInviteCopied(true))
      .catch(() => undefined);
  };

  return (
    <div className="aops-v2-chat-activity">
      <section className="aops-v2-chat-activity-card">
        <h5>{t("chatActivityDirective")}</h5>
        {directive ? (
          <div className="aops-v2-chat-activity-directive">
            <span className="eops-chip eops-chip--sage cp-chip-xs">#{directive.seq}</span>
            <span>
              <b>{directive.acked}</b>/{directive.total} {t("chatActivityAcked")}
            </span>
            <span className="aops-v2-chat-muted">
              {directive.mine ? t("chatActivityAcknowledged") : t("chatActivityPending")}
            </span>
          </div>
        ) : (
          <p className="aops-v2-chat-muted">{t("chatActivityNoDirective")}</p>
        )}
      </section>

      <section className="aops-v2-chat-activity-card">
        <h5>{t("chatActivityPresenceTitle")}</h5>
        <ul className="aops-v2-chat-presencelist">
          {model.members.map((m) => {
            const state = memberPresenceState(model, m.id);
            return (
              <li key={m.id}>
                <span className={`aops-v2-chat-presdot ${presenceDotClass(state)}`} aria-hidden />
                <span className="aops-v2-chat-membername">@{m.handle}</span>
                <span className="aops-v2-chat-muted">{presenceLabel(state, t)}</span>
              </li>
            );
          })}
          {model.members.length === 0 ? (
            <li className="aops-v2-chat-muted">{t("chatMembersEmpty")}</li>
          ) : null}
        </ul>
      </section>

      <section className="aops-v2-chat-activity-card">
        <h5>{t("chatActivityRoomMeta")}</h5>
        <dl className="aops-v2-chat-meta">
          <div>
            <dt>{t("chatActivityEpoch")}</dt>
            <dd>#{room.currentEpoch}</dd>
          </div>
          <div>
            <dt>{t("chatMessageCount")}</dt>
            <dd>{model.messages.length}</dd>
          </div>
        </dl>
        <ChatInviteBlock
          invite={model.invite}
          copied={inviteCopied}
          onCopy={copyInvite}
          t={t}
        />
      </section>
    </div>
  );
}

function ChatInviteBlock({
  invite,
  copied,
  onCopy,
  t
}: {
  invite: string | null;
  copied: boolean;
  onCopy: () => void;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  if (!invite) return null;
  return (
    <div className="aops-v2-chat-inviteblock">
      <p className="aops-v2-chat-invitehint">{t("chatInviteHint")}</p>
      <div className="aops-v2-chat-inviterow">
        <code className="aops-v2-chat-invitecode" title={invite}>
          {invite}
        </code>
        <button
          type="button"
          className="aops-v2-chat-headbtn aops-v2-chat-copyinvite aops-v2-chat-invitecopy"
          onClick={onCopy}
          title={copied ? t("chatInviteCopied") : t("chatCopyInvite")}
          data-state={copied ? "copied" : "idle"}
        >
          <span className="aops-v2-chat-invitecopy-icon" aria-hidden>
            {copied ? ChatCheckIcon() : ChatCopyIcon()}
          </span>
          {copied ? t("chatInviteCopied") : t("chatCopyInvite")}
        </button>
      </div>
    </div>
  );
}

// Channel/room lifecycle actions (a popover menu in the room header). Hosted
// ChatV3 exposes create + archive + delete — there is NO rename/update-title op
// in the domain, so titles are immutable; the menu surfaces archive/delete/leave
// only. The general room cannot be deleted (server-protected).
function ChatRoomActionsMenu({
  open,
  onToggle,
  onClose,
  isGeneralRoom,
  channelArchived,
  canDeleteChannel,
  invite,
  inviteCopied,
  inviteCopyBusy,
  t,
  onCopyInvite,
  onArchiveRoom,
  onDeleteRoom,
  onArchiveChannel,
  onUnarchiveChannel,
  onDeleteChannel,
  onLeaveChannel
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  isGeneralRoom: boolean;
  channelArchived: boolean;
  canDeleteChannel: boolean;
  invite: string | null;
  inviteCopied: boolean;
  inviteCopyBusy: boolean;
  t: (key: AopsCockpitTranslationKey) => string;
  onCopyInvite: () => void;
  onArchiveRoom: () => void;
  onDeleteRoom: () => void;
  onArchiveChannel: () => void;
  onUnarchiveChannel: () => void;
  onDeleteChannel: () => void;
  onLeaveChannel: () => void;
}): ReactNode {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="aops-v2-chat-actions" ref={menuRef}>
      <button
        type="button"
        className={`aops-v2-chat-headbtn${open ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("chatActions")}
        onClick={onToggle}
      >
        {ChatMoreIcon()}
      </button>
      {open ? (
        <div className="aops-v2-chat-actions-menu" role="menu">
          <span className="aops-v2-chat-actions-label">{t("chatRoomSection")}</span>
          <button type="button" role="menuitem" onClick={onArchiveRoom}>
            {t("chatArchiveRoom")}
          </button>
          {!isGeneralRoom ? (
            <button type="button" role="menuitem" className="is-danger" onClick={onDeleteRoom}>
              {t("chatDeleteRoom")}
            </button>
          ) : null}
          <span className="aops-v2-chat-actions-sep" aria-hidden />
          <span className="aops-v2-chat-actions-label">{t("chatChannelSection")}</span>
          <button
            type="button"
            role="menuitem"
            disabled={!invite || inviteCopyBusy}
            title={invite ? t("chatCopyInvite") : t("chatInviteUnavailable")}
            onClick={onCopyInvite}
          >
            {inviteCopied ? t("chatInviteCopied") : t("chatInviteAction")}
          </button>
          {channelArchived ? (
            <button type="button" role="menuitem" onClick={onUnarchiveChannel}>
              {t("chatUnarchiveChannel")}
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={onArchiveChannel}>
              {t("chatArchiveChannel")}
            </button>
          )}
          <button type="button" role="menuitem" onClick={onLeaveChannel}>
            {t("chatLeaveChannel")}
          </button>
          {canDeleteChannel ? (
            <button type="button" role="menuitem" className="is-danger" onClick={onDeleteChannel}>
              {t("chatDeleteChannel")}
            </button>
          ) : null}
          <span className="aops-v2-chat-actions-hint">{t("chatRenameUnsupported")}</span>
        </div>
      ) : null}
    </div>
  );
}

// Create a room inside the active channel (modal).
function ChatCreateRoomModal({
  model,
  t,
  onClose
}: {
  model: ChatSession;
  t: (key: AopsCockpitTranslationKey) => string;
  onClose: () => void;
}): ReactNode {
  const [title, setTitle] = useState("");
  const [rules, setRules] = useState("");
  const busy = model.status === "connecting";

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await model.createRoom({
      slug: slugifyName(trimmed),
      title: trimmed,
      guidanceMarkdown: rules || undefined
    });
    onClose();
  };

  return (
    <ChatModal title={t("chatNewRoom")} closeLabel={t("chatClose")} size="sm" onClose={onClose}>
      <label className="aops-v2-chat-field">
        <span>{t("chatRoomName")}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("chatRoomNamePh")}
          autoFocus
        />
      </label>
      <label className="aops-v2-chat-field">
        <span>{t("chatRoomRules")}</span>
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder={t("chatChannelRulesPh")}
          rows={2}
        />
      </label>
      <div className="aops-v2-chat-connect-actions">
        <button type="button" className="aops-v2-secondary-button" onClick={onClose}>
          {t("chatCancel")}
        </button>
        <button
          type="button"
          className="aops-v2-primary-button"
          disabled={busy || !title.trim()}
          onClick={() => void submit()}
        >
          {busy ? t("chatStatusConnecting") : t("chatCreateRoom")}
        </button>
      </div>
    </ChatModal>
  );
}

// Type-the-slug-to-confirm delete (rooms + channels). The hosted delete ops
// require the exact slug, so this both gates accidental deletes and supplies the
// confirmSlug the client needs.
function ChatConfirmDeleteModal({
  target,
  t,
  onClose,
  onConfirm
}: {
  target: { kind: "room" | "channel"; id: string; slug: string; label: string };
  t: (key: AopsCockpitTranslationKey) => string;
  onClose: () => void;
  onConfirm: () => void;
}): ReactNode {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = typed.trim() === target.slug;

  return (
    <div className="aops-v2-chat-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="aops-v2-chat-modal aops-v2-chat-modal-sm"
        role="dialog"
        aria-modal="true"
        aria-label={t("chatDeleteConfirmTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="aops-v2-chat-modal-head">
          <h4>{t("chatDeleteConfirmTitle")}</h4>
          <button
            type="button"
            className="aops-v2-chat-iconclose"
            aria-label={t("chatClose")}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="aops-v2-chat-modal-body">
          <p className="aops-v2-chat-muted">{t("chatDeleteConfirmMessage")}</p>
          <label className="aops-v2-chat-field">
            <span>
              {t("chatDeleteConfirmSlugLabel")}: <code>{target.slug}</code>
            </span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </label>
          <div className="aops-v2-chat-connect-actions">
            <button
              type="button"
              className="aops-v2-chat-danger-button"
              disabled={!matches}
              onClick={onConfirm}
            >
              {t("chatDelete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Read-only references panel (copy-only; NO arbitrary URL execution / navigation
// / mutation — honours the cockpit no-mutation + read-only-ref guardrail).
function ChatRefsPanel({
  bindings,
  t
}: {
  bindings: ChatSession["bindings"];
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyRef = (value: string, id: string) => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(id))
      .catch(() => undefined);
  };

  return (
    <section className="aops-v2-chat-refs" aria-label={t("chatRefsTitle")}>
      <h5>{t("chatRefsTitle")}</h5>
      {bindings.length === 0 ? (
        <p className="aops-v2-chat-muted">{t("chatRefsEmpty")}</p>
      ) : (
        <ul className="aops-v2-chat-reflist">
          {bindings.map((binding) => {
            const value = binding.uri || binding.refId || binding.id;
            return (
              <li key={binding.id}>
                <div className="aops-v2-chat-ref-main">
                  <span className="eops-chip eops-chip--ghost cp-chip-xs">{binding.bindingType}</span>
                  <span className="aops-v2-chat-ref-title">{binding.title || value}</span>
                </div>
                {binding.note ? <span className="aops-v2-chat-muted">{binding.note}</span> : null}
                <button
                  type="button"
                  className="aops-v2-chat-ref-copy"
                  onClick={() => copyRef(value, binding.id)}
                >
                  {copied === binding.id ? t("chatCopied") : t("chatRefsCopy")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Create-channel / join-by-invite surface (the old cockpit's ChatConnect),
// reimplemented for v2 as a modal with Cancel + close.
function ChatConnectModal({
  model,
  t,
  initialMode,
  onClose
}: {
  model: ChatSession;
  t: (key: AopsCockpitTranslationKey) => string;
  initialMode: "create" | "join";
  onClose: () => void;
}): ReactNode {
  const [mode, setMode] = useState<"create" | "join">(initialMode);
  const [handle, setHandle] = useState("operator");
  const [title, setTitle] = useState("");
  const [rules, setRules] = useState("");
  const [invite, setInvite] = useState("");
  const [encryptionMode, setEncryptionMode] = useState<"server-encrypted" | "e2e">("server-encrypted");
  const busy = model.status === "connecting";
  const canSubmit = mode === "create" ? Boolean(title.trim()) : Boolean(invite.trim());

  const submit = async () => {
    if (mode === "create") {
      if (!title.trim()) return;
      await model.createChannel({ handle, title, guidanceMarkdown: rules || undefined, encryptionMode });
    } else {
      if (!invite.trim()) return;
      await model.joinChannel({ handle, invite });
    }
    onClose();
  };

  return (
    <ChatModal title={t("chatConnectPanelTitle")} closeLabel={t("chatClose")} onClose={onClose}>
      <div className="aops-v2-chat-connect-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          className={`aops-v2-chat-connect-tab${mode === "create" ? " is-active" : ""}`}
          onClick={() => setMode("create")}
        >
          {t("chatCreateTab")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "join"}
          className={`aops-v2-chat-connect-tab${mode === "join" ? " is-active" : ""}`}
          onClick={() => setMode("join")}
        >
          {t("chatJoinTab")}
        </button>
      </div>
      <label className="aops-v2-chat-field">
        <span>{t("chatHandle")}</span>
        <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="operator" />
      </label>
      {mode === "create" ? (
        <>
          <label className="aops-v2-chat-field">
            <span>{t("chatChannelName")}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("chatChannelNamePh")}
            />
          </label>
          <fieldset className="aops-v2-chat-field aops-v2-chat-encryption-mode">
            <legend>{t("chatEncryptionMode")}</legend>
            <label className={`aops-v2-chat-mode-option${encryptionMode === "server-encrypted" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="chat-encryption-mode"
                value="server-encrypted"
                checked={encryptionMode === "server-encrypted"}
                onChange={() => setEncryptionMode("server-encrypted")}
              />
              <span>
                <strong>{t("chatEncryptionServer")}</strong>
                <small>{t("chatEncryptionServerHint")}</small>
              </span>
            </label>
            <label className={`aops-v2-chat-mode-option${encryptionMode === "e2e" ? " is-active" : ""}`}>
              <input
                type="radio"
                name="chat-encryption-mode"
                value="e2e"
                checked={encryptionMode === "e2e"}
                onChange={() => setEncryptionMode("e2e")}
              />
              <span>
                <strong>{t("chatEncryptionE2e")}</strong>
                <small>{t("chatEncryptionE2eHint")}</small>
              </span>
            </label>
          </fieldset>
          <label className="aops-v2-chat-field">
            <span>{t("chatChannelRules")}</span>
            <textarea
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder={t("chatChannelRulesPh")}
              rows={3}
            />
          </label>
        </>
      ) : (
        <label className="aops-v2-chat-field">
          <span>{t("chatInvite")}</span>
          <input
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            placeholder={t("chatInvitePh")}
          />
        </label>
      )}
      <div className="aops-v2-chat-connect-actions">
        <button type="button" className="aops-v2-secondary-button" onClick={onClose}>
          {t("chatCancel")}
        </button>
        <button
          type="button"
          className="aops-v2-primary-button"
          disabled={busy || !canSubmit}
          onClick={() => void submit()}
        >
          {busy ? t("chatStatusConnecting") : mode === "create" ? t("chatCreate") : t("chatJoin")}
        </button>
      </div>
    </ChatModal>
  );
}

// Page action bar (eops inventory-item-detail parity, shared with PM): 30px
// round ghost icon buttons — back · refresh · kebab. Replaces the old text
// Refresh button; the kebab exposes Refresh data + Go to Projects.
const ChatBackIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M10 2.5 4.5 8 10 13.5M4.5 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChatRefreshIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.88M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChatKebabIcon = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
    <circle cx="8" cy="3.25" r="1.4" fill="currentColor" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    <circle cx="8" cy="12.75" r="1.4" fill="currentColor" />
  </svg>
);

export function ChatActionBar({
  isFetching,
  disabled,
  onRefresh,
  onBack,
  t
}: {
  isFetching: boolean;
  disabled?: boolean;
  onRefresh: () => void;
  onBack: () => void;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="aops-pm-actionbar">
      <button
        type="button"
        className="aops-pm-action-btn"
        onClick={onBack}
        aria-label={t("pmActionBack")}
        title={t("pmActionBack")}
      >
        {ChatBackIcon}
      </button>
      <button
        type="button"
        className={`aops-pm-action-btn${isFetching ? " is-busy" : ""}`}
        onClick={onRefresh}
        disabled={disabled}
        aria-label={t("pmRefresh")}
        title={t("pmRefresh")}
      >
        {ChatRefreshIcon}
      </button>
      <div className="aops-pm-action-menuwrap" ref={menuRef}>
        <button
          type="button"
          className={`aops-pm-action-btn${menuOpen ? " is-active" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("pmActionMore")}
          title={t("pmActionMore")}
        >
          {ChatKebabIcon}
        </button>
        {menuOpen ? (
          <div className="aops-pm-action-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="aops-pm-action-menu-item"
              disabled={disabled}
              onClick={() => {
                setMenuOpen(false);
                onRefresh();
              }}
            >
              {t("pmActionRefreshData")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="aops-pm-action-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onBack();
              }}
            >
              {t("pmActionGoProjects")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
