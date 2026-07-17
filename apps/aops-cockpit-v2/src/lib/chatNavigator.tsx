import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  NavigatorCategoryIconBar,
  NavigatorLeftMenuButton,
  ProjectScopeNavigatorLabel,
  useWorkbenchNavigator,
  WorkbenchNavigator,
  WorkbenchThinBar,
  type NavigatorTreeRow
} from "@aopslab/xf-ui-composition-react";
import { CockpitPanelCloseIcon } from "../components/CockpitViewIconSwitch";
import type { AopsCockpitTranslationKey } from "./i18n";
import type { ChatChannelRef, ChatRoomRef, ChatSession } from "./chat";
import { avatarColor } from "../components/chat/avatar";

// The chat navigator is a TWO-LEVEL tree (channels = expandable branches, rooms
// = leaves). Like the projects navigator it can render either inline
// (master-detail "left-menu" mode) or shell-attached (the far-left workbench
// dock, "navigator" mode); the gear's Mode switch toggles between them. The
// hook emits `treePanel` (bare tree for the in-page split) and `dockNode`
// (the shell-dock variant), plus the AppShell left-dock state.

const CHANNEL_PREFIX = "ch:";
const ROOM_PREFIX = "rm:"; // rm:<channelId>:<roomId>

const NAV_STORAGE_KEYS = {
  mode: "aops-cockpit-v2.chat.navMode",
  open: "aops-cockpit-v2.chat.navOpen",
  pinned: "aops-cockpit-v2.chat.navPinned",
  navigatorWidth: "aops-cockpit-v2.chat.navigatorWidth",
  leftMenuWidth: "aops-cockpit-v2.chat.leftMenuWidth"
};

export type ChatNavRow = NavigatorTreeRow & {
  kind: "channel" | "room";
  labelText: string;
  titleText: string;
  channelId: string;
  roomId?: string;
  channel?: ChatChannelRef;
  room?: ChatRoomRef;
  locked?: boolean;
  archived?: boolean;
  encryptionMode?: ChatChannelRef["encryptionMode"];
  roomCount?: number;
  lockedHint?: string;
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function roomKey(channelId: string, roomId: string): string {
  return `${ROOM_PREFIX}${channelId}:${roomId}`;
}

function parseRoomKey(key: string): { channelId: string; roomId: string } | null {
  if (!key.startsWith(ROOM_PREFIX)) return null;
  const rest = key.slice(ROOM_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  return { channelId: rest.slice(0, sep), roomId: rest.slice(sep + 1) };
}

function roomsForChannel(
  channel: ChatChannelRef,
  activeChannelId: string | null,
  activeRooms: ChatRoomRef[]
): ChatRoomRef[] {
  if (channel.id === activeChannelId && activeRooms.length) return activeRooms;
  return channel.rooms ?? [];
}

function buildChatRows(
  channels: ChatChannelRef[],
  expanded: Set<string>,
  activeChannelId: string | null,
  activeRooms: ChatRoomRef[],
  search: string,
  t: (key: AopsCockpitTranslationKey) => string
): { rows: ChatNavRow[]; counts: Record<string, { total: number }> } {
  const query = search.trim().toLowerCase();
  const rows: ChatNavRow[] = [];
  const counts: Record<string, { total: number }> = {};

  for (const channel of channels) {
    const archived = channel.status === "archived";
    const locked = !channel.memberToken && !channel.localCryptoAvailable && !archived;
    const rooms = locked ? [] : roomsForChannel(channel, activeChannelId, activeRooms);
    const channelMatches =
      !query || `${channel.title} ${channel.slug}`.toLowerCase().includes(query);
    const matchedRooms = query
      ? rooms.filter((room) => `${room.title} ${room.slug}`.toLowerCase().includes(query))
      : rooms;
    if (query && !channelMatches && matchedRooms.length === 0) continue;

    const channelUid = `${CHANNEL_PREFIX}${channel.id}`;
    counts[channelUid] = { total: rooms.length };
    const isExpanded = query ? true : expanded.has(channel.id);
    const lockedHint =
      channel.recoveryState === "locked-needs-pin"
        ? t("chatLockedNeedsPinHint")
        : channel.recoveryState === "stale-needs-current-device"
          ? t("chatLockedStaleHint")
          : channel.recoveryState === "recoverable"
            ? t("chatLockedRecoverableHint")
            : t("chatLockedHint");
    const metaLines = [
      channel.status === "archived" ? "archived" : null,
      locked ? lockedHint : null
    ].filter(Boolean) as string[];
    rows.push({
      categoryUid: channelUid,
      kind: "channel",
      depth: 0,
      hasChildren: rooms.length > 0,
      isExpanded,
      channelId: channel.id,
      channel,
      labelText: channel.title || channel.slug,
      titleText: [channel.title || channel.slug, channel.slug].filter(Boolean).join(" · "),
      locked,
      archived,
      encryptionMode: channel.encryptionMode,
      roomCount: rooms.length,
      lockedHint: locked ? lockedHint : undefined,
      label: channel.title || channel.slug,
      hideDefaultMeta: true,
      metaLines: metaLines.length ? metaLines : undefined
    });
    if (!isExpanded) continue;
    const visibleRooms = query ? matchedRooms : rooms;
    for (const room of visibleRooms) {
      rows.push({
        categoryUid: roomKey(channel.id, room.id),
        kind: "room",
        depth: 1,
        hasChildren: false,
        channelId: channel.id,
        roomId: room.id,
        room,
        labelText: room.title || room.slug,
        titleText:
          room.slug && room.slug !== room.title
            ? `${room.title || room.slug} · ${room.slug}`
            : room.title || room.slug,
        label: room.title || room.slug,
        hideDefaultMeta: true,
        metaLines: undefined
      });
    }
  }
  return { rows, counts };
}

function channelInitial(channel: ChatChannelRef): string {
  return (channel.title || channel.slug || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function ModeGlyph({ mode }: { mode: ChatChannelRef["encryptionMode"] | undefined }): ReactNode {
  const isServer = mode === "server-encrypted";
  const title = isServer ? "Server-encrypted channel" : "End-to-end encrypted channel";
  return (
    <span className="aops-v2-chat-navmode" title={title} aria-label={title}>
      {isServer ? (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M8 1.8 13 3.7v3.4c0 3.1-1.9 5.8-5 7.1-3.1-1.3-5-4-5-7.1V3.7l5-1.9Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinejoin="round"
          />
          <path
            d="m5.6 8 1.5 1.5 3.3-3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <rect
            x="3.2"
            y="6.8"
            width="9.6"
            height="7"
            rx="1.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
          />
        </svg>
      )}
    </span>
  );
}

function LockGlyph({ title }: { title: string }): ReactNode {
  return (
    <span className="aops-v2-chat-navlock" title={title} aria-label={title}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M5 6.8V5.2a3 3 0 0 1 6 0v1.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <rect
          x="3.7"
          y="6.6"
          width="8.6"
          height="6.8"
          rx="1.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
        />
      </svg>
    </span>
  );
}

function SearchGlyph(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChannelRowLabel({ row }: { row: ChatNavRow }): ReactNode {
  const channel = row.channel;
  if (!channel) return row.labelText;
  return (
    <span
      className={cx(
        "aops-v2-chat-navlabel is-channel",
        row.locked && "is-locked",
        row.archived && "is-archived"
      )}
    >
      <span
        className="aops-v2-chat-navavatar"
        style={{ background: avatarColor(channel.id || channel.slug) }}
        aria-hidden="true"
      >
        {channelInitial(channel)}
      </span>
      <span className="aops-v2-chat-navtext">
        <span className="aops-v2-chat-navname" title={row.titleText}>
          {row.labelText}
        </span>
      </span>
      <span className="aops-v2-chat-navside">
        {row.roomCount && row.roomCount > 0 ? (
          <span
            className="aops-v2-chat-navbadge"
            title={`${row.roomCount} rooms`}
            aria-label={`${row.roomCount} rooms`}
          />
        ) : null}
        <ModeGlyph mode={row.encryptionMode} />
        {row.locked ? <LockGlyph title={row.lockedHint || "Locked channel"} /> : null}
        {row.archived ? <span className="aops-v2-chat-navstate">archived</span> : null}
      </span>
    </span>
  );
}

function RoomRowLabel({ row }: { row: ChatNavRow }): ReactNode {
  return (
    <span className="aops-v2-chat-navlabel is-room" title={row.titleText}>
      <span className="aops-v2-chat-roomhash" aria-hidden="true">
        #
      </span>
      <span className="aops-v2-chat-navname" title={row.titleText}>
        {row.labelText}
      </span>
    </span>
  );
}

function triggerChatConnect(mode: "create" | "join"): void {
  if (typeof document === "undefined") return;
  const createButton = document.querySelector<HTMLButtonElement>(
    ".aops-v2-chat-toolbar .aops-v2-chat-addbtn"
  );
  createButton?.click();
  if (mode !== "join") return;
  window.setTimeout(() => {
    const joinTab = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".aops-v2-chat-connect-tab")
    ).find((button) => /join|katıl/i.test(button.textContent || ""));
    joinTab?.click();
  }, 0);
}

function EmptyChatNavigator({
  hasChannels,
  search,
  t
}: {
  hasChannels: boolean;
  search: string;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  if (hasChannels && search.trim()) {
    return <p className="inv-iv3-cattree-empty">{t("chatNoChannelsSearch")}</p>;
  }
  return (
    <div className="inv-iv3-cattree-empty aops-v2-chat-navempty">
      <span>{t("chatNoChannelsNav")}</span>
      <span className="aops-v2-chat-navempty-actions">
        <button type="button" onClick={() => triggerChatConnect("create")}>
          {t("chatNewChannel")}
        </button>
        <button type="button" onClick={() => triggerChatConnect("join")}>
          {t("chatJoinChannel")}
        </button>
      </span>
    </div>
  );
}

function ChatNavigatorTreeBody({
  rows,
  selectedKey,
  hasChannels,
  search,
  onSelect,
  onToggleBranch,
  t
}: {
  rows: ChatNavRow[];
  selectedKey: string;
  hasChannels: boolean;
  search: string;
  onSelect: (key: string) => void;
  onToggleBranch: (key: string) => void;
  t: (key: AopsCockpitTranslationKey) => string;
}): ReactNode {
  if (!rows.length) return <EmptyChatNavigator hasChannels={hasChannels} search={search} t={t} />;
  return (
    <div className="cat-wb-tree-panel aops-v2-chat-navtree">
      {rows.map((row) => {
        const isActive = row.categoryUid === selectedKey;
        const isRoot = row.depth === 0;
        const rowTitle = [
          row.titleText,
          row.locked ? row.lockedHint : "",
          row.archived ? "archived" : "",
          row.encryptionMode
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={row.categoryUid}
            className={cx(
              "cat-wb-tree-row",
              isActive && "active",
              isRoot && "is-root",
              !row.hasChildren && "is-leaf",
              row.kind === "channel" && "is-chat-channel",
              row.kind === "room" && "is-chat-room",
              row.locked && "is-chat-locked",
              row.archived && "is-chat-archived"
            )}
            data-testid={`itemsv3-cattree-row-${row.categoryUid}`}
          >
            <span
              className="cat-wb-tree-indent"
              aria-hidden="true"
              style={{ width: `${(row.depth ?? 0) * 16}px` }}
            />
            {row.hasChildren ? (
              <button
                className="cat-wb-tree-toggle"
                type="button"
                tabIndex={-1}
                aria-label={row.isExpanded ? "Collapse channel" : "Expand channel"}
                aria-expanded={row.isExpanded}
                onClick={() => onToggleBranch(row.categoryUid)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path
                    d={row.isExpanded ? "M4 6 8 10l4-4" : "M6 4l4 4-4 4"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="cat-wb-tree-toggle-spacer" aria-hidden="true" />
            )}
            <button
              className={cx("cat-wb-tree-entry", isActive && "active", isRoot && "is-root")}
              type="button"
              title={rowTitle}
              aria-label={rowTitle || undefined}
              onClick={() => onSelect(row.categoryUid)}
              aria-expanded={row.hasChildren ? row.isExpanded : undefined}
              data-tree-entry="true"
              data-category-uid={row.categoryUid}
              data-testid={`itemsv3-cattree-entry-${row.categoryUid}`}
            >
              <span className="cat-wb-tree-copy">
                <span className="cat-wb-tree-title-row">
                  <span className="cat-wb-tree-title">
                    {row.kind === "channel" ? <ChannelRowLabel row={row} /> : <RoomRowLabel row={row} />}
                  </span>
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export interface ChatNavigator {
  /** The raw useWorkbenchNavigator controller — fed to WorkbenchRecordDetailLayout
   *  so the A1 record-detail body drives the same navigator state. */
  controller: ReturnType<typeof useWorkbenchNavigator>;
  /** The bare two-level navigator tree (search + icon bar + gear + tree).
   *  Rendered inline in the A1 record-detail left-menu (left-menu mode). */
  treePanel: ReactNode;
  /** The shell-attached navigator dock (NAVIGATOR header + the tree) — handed to
   *  AppShell's leftDock in navigator mode. */
  dockNode: ReactNode;
  /** Navigator-mode reopen affordance for the shell thin bar (eops parity — the
   *  launcher lives in the top rail / content top-left, never the body). Non-null
   *  when the navigator is unpinned (overlay launcher) OR pinned-but-closed
   *  (reopen button); null when the dock is shown or in left-menu mode. */
  navThinBar: ReactNode;
  isLeftMenuMode: boolean;
  /** Whether the shell-attached navigator dock is open (navigator mode). */
  isNavigatorOpen: boolean;
  /** Whether the navigator dock is pinned (vs. unpinned overlay popover). */
  isPinned: boolean;
  /** Re-open the shell-attached navigator dock after a close. */
  openNavigator: () => void;
  /** AppShell left-dock mode for the shell-attached navigator. */
  leftDockMode: "hidden" | "overlay" | "pinned";
  leftDockWidth: number;
  channelCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export function useChatNavigator(
  chat: ChatSession,
  t: (key: AopsCockpitTranslationKey) => string
): ChatNavigator {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const nav = useWorkbenchNavigator({
    storageKeys: NAV_STORAGE_KEYS,
    defaultMode: "left-menu",
    defaultOpen: true,
    // Uncontrolled pin state (default pinned) so the dock's pin/unpin button
    // actually toggles: pinned -> shell dock, unpinned -> overlay popover.
    defaultPinned: true,
    defaultNavigatorWidth: 320,
    defaultLeftMenuWidth: 300,
    leftMenuMinWidth: 240,
    leftMenuMaxWidth: 460
  });

  const { rows } = useMemo(
    () => buildChatRows(chat.channels, expanded, chat.channelId, chat.rooms, search, t),
    [chat.channels, expanded, chat.channelId, chat.rooms, search, t]
  );

  const selectedKey =
    chat.activeRoomId && chat.channelId
      ? roomKey(chat.channelId, chat.activeRoomId)
      : chat.channelId
        ? `${CHANNEL_PREFIX}${chat.channelId}`
        : "";

  const toggleChannel = useCallback(
    (channelId: string) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(channelId)) next.delete(channelId);
        else next.add(channelId);
        return next;
      }),
    []
  );

  const handleSelect = useCallback(
    (key: string) => {
      const room = parseRoomKey(key);
      if (room) {
        chat.selectRoom(room.roomId, room.channelId);
        return;
      }
      if (key.startsWith(CHANNEL_PREFIX)) {
        const channelId = key.slice(CHANNEL_PREFIX.length);
        const channel = chat.channels.find((entry) => entry.id === channelId);
        const needsRecoveryAttempt =
          Boolean(channel) &&
          channel?.status !== "archived" &&
          !channel?.memberToken &&
          !channel?.localCryptoAvailable;
        setExpanded((previous) => new Set(previous).add(channelId));
        if (channelId !== chat.channelId || needsRecoveryAttempt) void chat.selectChannel(channelId);
      }
    },
    [chat]
  );

  const handleToggleBranch = useCallback(
    (key: string) => {
      if (key.startsWith(CHANNEL_PREFIX)) toggleChannel(key.slice(CHANNEL_PREFIX.length));
    },
    [toggleChannel]
  );

  const allChannelIds = useMemo(() => chat.channels.map((c) => c.id), [chat.channels]);
  const autoExpandChannelIds = useMemo(() => {
    const ids = new Set<string>();
    if (chat.channelId) ids.add(chat.channelId);
    if (chat.channels.length === 1) ids.add(chat.channels[0].id);
    return Array.from(ids).filter((id) => {
      const channel = chat.channels.find((entry) => entry.id === id);
      return channel ? roomsForChannel(channel, chat.channelId, chat.rooms).length > 0 : false;
    });
  }, [chat.channelId, chat.channels, chat.rooms]);

  useEffect(() => {
    if (!autoExpandChannelIds.length) return;
    setExpanded((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const channelId of autoExpandChannelIds) {
        if (!next.has(channelId)) {
          next.add(channelId);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [autoExpandChannelIds]);

  const handleExpandAll = useCallback(() => setExpanded(new Set(allChannelIds)), [allChannelIds]);
  const handleCollapseAll = useCallback(() => setExpanded(new Set()), []);
  const handleNarrowPane = useCallback(() => {
    nav.setLeftMenuWidth(nav.leftMenuMinWidth);
    nav.setNavigatorWidth(nav.navigatorMinWidth);
  }, [nav]);
  const handleFitPane = useCallback(() => {
    const nextLeftWidth = Math.min(nav.leftMenuMaxWidth, Math.max(nav.leftMenuWidth + 72, 340));
    const nextNavigatorWidth = Math.min(
      nav.navigatorMaxWidth,
      Math.max(nav.navigatorWidth + 72, 360)
    );
    nav.setLeftMenuWidth(nextLeftWidth);
    nav.setNavigatorWidth(nextNavigatorWidth);
  }, [nav]);
  const openNavigator = useCallback(() => nav.openNavigator(), [nav]);

  const tNavigatorTools = useCallback((_key: string, fallback = "") => fallback, []);

  const iconBar = (
    <NavigatorCategoryIconBar
      settingsSlot={
        <button
          type="button"
          className="inv-iv3-cattree-tool-btn aops-v2-tree-close"
          aria-label={t("navSidePanelClose")}
          title={t("navSidePanelClose")}
          onClick={() => nav.setOpen(false)}
          data-testid="aops-v2-chat-tree-close"
        >
          <CockpitPanelCloseIcon />
        </button>
      }
      onExpandAll={handleExpandAll}
      onCollapseAll={handleCollapseAll}
      onNarrowPane={handleNarrowPane}
      onFitPane={handleFitPane}
      onSwitchToNavigator={nav.isLeftMenuMode ? () => nav.switchToNavigator() : undefined}
      expandDisabled={allChannelIds.length === 0 || expanded.size >= allChannelIds.length}
      collapseDisabled={expanded.size === 0}
      narrowDisabled={
        nav.isLeftMenuMode
          ? Math.round(nav.leftMenuWidth) <= nav.leftMenuMinWidth
          : Math.round(nav.navigatorWidth) <= nav.navigatorMinWidth
      }
      fitDisabled={chat.channels.length === 0}
      tItems={tNavigatorTools}
    />
  );

  const treePanel = (
    <div
      className="inv-iv3-cattree-pane aops-v2-chat-navstack"
      aria-label={t("chatChannelsLabel")}
    >
      <div className="aops-v2-chat-nav-search-card">
        <label className="aops-v2-chat-nav-search">
          <span className="aops-v2-chat-nav-search-icon">{SearchGlyph()}</span>
          <input
            type="search"
            className="aops-v2-chat-nav-search-input"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t("chatSearchPlaceholder")}
            aria-label={t("chatSearchPlaceholder")}
            data-testid="itemsv3-cattree-search"
          />
        </label>
      </div>
      <div className="aops-v2-chat-nav-toolrow">{iconBar}</div>
      <div className="inv-iv3-cattree-body aops-v2-chat-nav-listcard">
        <ChatNavigatorTreeBody
          rows={rows}
          selectedKey={selectedKey}
          hasChannels={chat.channels.length > 0}
          search={search}
          onSelect={handleSelect}
          onToggleBranch={handleToggleBranch}
          t={t}
        />
      </div>
    </div>
  );

  // Shell-attached navigator dock: WorkbenchNavigator renders the NAVIGATOR
  // header (+ pin/close) with the tree. The header's left-menu button mirrors
  // eops's quick switch back to the in-page left menu.
  const dockNode = (
    <WorkbenchNavigator
      controller={nav}
      label="NAVIGATOR"
      panelTitle={t("chatNavPanelTitle")}
      showHeader
      showProjectSelection={false}
      dockClassName="aops-v2-chat-navdock"
      headerActions={
        <NavigatorLeftMenuButton active={false} onClick={() => nav.switchToLeftMenu()} />
      }
    >
      {treePanel}
    </WorkbenchNavigator>
  );

  // pinned + open -> the shell reserves a dock slot; unpinned -> an overlay
  // popover (the shell renders only the portal target, the dockNode launcher is
  // mounted in the page); pinned + closed or left-menu -> hidden.
  const leftDockMode: "hidden" | "overlay" | "pinned" = nav.isLeftMenuMode
    ? "hidden"
    : nav.pinned
      ? nav.open
        ? "pinned"
        : "hidden"
      : "overlay";

  // Navigator-mode reopen affordance, hosted in the shell thin bar (eops parity:
  // top rail / content top-left, NOT a toolbar button and NOT the body). Shown
  // whenever the navigator is in navigator-mode but the dock isn't displayed:
  //  - unpinned   -> the navigator launcher + overlay popover (dockNode);
  //  - pinned+closed (dock X) -> a labelled icon button that reopens the dock.
  const navThinBar: ReactNode =
    !nav.isLeftMenuMode && (!nav.pinned || !nav.open) ? (
      <WorkbenchThinBar
        className="aops-v2-chat-overlay-rail"
        launcherClassName="aops-v2-chat-overlay-launcher"
        launcher={
          !nav.pinned ? (
            dockNode
          ) : (
            <button
              type="button"
              className="aops-v2-nav-reopen"
              onClick={openNavigator}
              aria-label={t("chatNavReopen")}
              title={t("chatNavReopen")}
              data-testid="aops-v2-chat-nav-reopen"
            >
              <ProjectScopeNavigatorLabel label={t("chatNavModeNavigator")} />
            </button>
          )
        }
      />
    ) : null;

  return {
    controller: nav,
    treePanel,
    dockNode,
    navThinBar,
    isLeftMenuMode: nav.isLeftMenuMode,
    isNavigatorOpen: nav.open,
    isPinned: nav.pinned,
    openNavigator,
    leftDockMode,
    leftDockWidth: nav.navigatorWidth,
    channelCount: chat.channels.length,
    searchValue: search,
    onSearchChange: setSearch
  };
}
