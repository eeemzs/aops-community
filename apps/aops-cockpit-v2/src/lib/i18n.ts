import { useCallback } from "react";
import { I18nBm, type BmResourceInline } from "@aopslab/xf-i18n/bm";

interface AopsCockpitFields {
  projectSearch: string;
}

interface AopsCockpitTags {
  appTitle: string;
  webMode: string;
  navLandmark: string;
  navProjects: string;
  navProjectman: string;
  navSessions: string;
  navChat: string;
  dockPinned: string;
  dockCompact: string;
  projectsEyebrow: string;
  projectsTitle: string;
  projectsHeaderNote: string;
  projectsReadyTitle: string;
  projectsReadyMessage: string;
  projectsRegistryBadge: string;
  authCheckingTitle: string;
  authCheckingMessage: string;
  authErrorTitle: string;
  authRetry: string;
  authProviderTrusted: string;
  projectsRefresh: string;
  projectsLoadingTitle: string;
  projectsLoadingMessage: string;
  projectsErrorTitle: string;
  projectsEmptyTitle: string;
  projectsEmptyMessage: string;
  projectsListLabel: string;
  projectDetailTitle: string;
  projectDetailTabsLabel: string;
  projectTabOverview: string;
  projectTabOverviewHint: string;
  projectTabActivity: string;
  projectTabActivityHint: string;
  projectTabPlanning: string;
  projectTabPlanningHint: string;
  projectTabMemory: string;
  projectTabMemoryHint: string;
  projectTabDocs: string;
  projectTabDocsHint: string;
  projectOverviewTitle: string;
  projectOverviewMessage: string;
  projectPlanningTitle: string;
  projectPlanningMessage: string;
  projectMemoryTitle: string;
  projectMemoryMessage: string;
  projectDocsTitle: string;
  projectDocsMessage: string;
  projectOpenPlanning: string;
  projectOpenPlan: string;
  projectOpenMemory: string;
  projectOpenDocs: string;
  projectLatestPlan: string;
  projectLatestMemory: string;
  projectLatestDocs: string;
  projectSummaryLoading: string;
  projectSummaryError: string;
  projectSummaryEmpty: string;
  projectPulseTitle: string;
  projectPulseMessage: string;
  projectPulseOpenWork: string;
  projectPulsePendingReviews: string;
  projectPulseActiveMissions: string;
  projectPulseRunningRuns: string;
  projectDomainProjectman: string;
  projectDomainAgentspace: string;
  projectDomainDocman: string;
  projectDomainRunner: string;
  projectDomainReady: string;
  projectDomainLoading: string;
  projectDomainError: string;
  projectDomainEmpty: string;
  projectDomainLatest: string;
  projectActivityTitle: string;
  projectActivityMessage: string;
  projectActivitySnapshotNote: string;
  projectActivityRangeLabel: string;
  projectActivityRangeDay: string;
  projectActivityRangeWeek: string;
  projectActivityRangeMonth: string;
  projectActivityRangeAll: string;
  projectActivityTotal: string;
  projectActivityVisible: string;
  projectActivityDomains: string;
  projectActivityLatest: string;
  projectActivityEmpty: string;
  projectActivityOpen: string;
  projectActivityChanges: string;
  projectLatestDayTitle: string;
  projectLatestDayMessage: string;
  projectLatestDayOpenAll: string;
  projectLatestDayEmpty: string;
  projectDocGroups: string;
  projectReferences: string;
  projectSlug: string;
  projectKey: string;
  projectStatus: string;
  projectVisibility: string;
  projectType: string;
  projectScope: string;
  projectId: string;
  projectSelected: string;
  projectCount: string;
  unknownValue: string;
  appShort: string;
  localeToggle: string;
  pmTitle: string;
  pmHeaderNote: string;
  pmHeaderProjectId: string;
  pmSelectedProject: string;
  pmRefresh: string;
  pmNoProjectTitle: string;
  pmNoProjectMessage: string;
  pmLoadingTitle: string;
  pmLoadingMessage: string;
  pmErrorTitle: string;
  pmEmptyTitle: string;
  pmEmptyMessage: string;
  pmTabOverview: string;
  pmTabTasks: string;
  pmTabBoards: string;
  pmTabSprintsPlans: string;
  pmSectionBoards: string;
  pmSectionSprints: string;
  pmSectionIssues: string;
  pmSectionFeedback: string;
  pmSectionReviews: string;
  pmBandProject: string;
  pmBandProjectScope: string;
  pmActionBack: string;
  pmActionMore: string;
  pmActionRefreshData: string;
  pmActionGoProjects: string;
  pmGroupBy: string;
  pmFieldUpdated: string;
  pmRollupTodo: string;
  pmRollupDoing: string;
  pmRollupBlocked: string;
  pmRollupPaused: string;
  pmRollupInReview: string;
  pmRollupPostponed: string;
  pmRollupCancelled: string;
  pmRollupCompleted: string;
  // Shared navigator chrome (gear + reopen) — boards/sprints/projects navigators.
  navSettings: string;
  navMode: string;
  navModeNavigator: string;
  navModeLeftMenu: string;
  navModeDropdown: string;
  navModeCards: string;
  navPaneReopen: string;
  navSidePanelShow: string;
  navSidePanelHide: string;
  navSidePanelClose: string;
  navArchivedGroup: string;
  navActiveGroup: string;
  // Boards navigator
  pmNavActiveBoards: string;
  pmNavUntitledBoard: string;
  pmNavSearchBoards: string;
  pmNavFilterBoards: string;
  pmNavBoardTools: string;
  pmNavBoardsPane: string;
  pmNavNoBoards: string;
  pmNavNoBoardsMatch: string;
  pmNavBoardsPanelTitle: string;
  pmNavBoardK: string;
  pmNavSelectBoard: string;
  // Boards cards mode (aops-desktop board-register parity)
  pmCardsToolbar: string;
  pmCardsFilterTitle: string;
  pmCardsFilterScope: string;
  pmCardsFilterLabel: string;
  pmCardsFilterAll: string;
  pmCardsFilterAllNote: string;
  pmCardsFilterFavorites: string;
  pmCardsFilterFavoritesNote: string;
  pmCardsFilterWithTasks: string;
  pmCardsFilterWithTasksNote: string;
  pmCardsFilterClear: string;
  pmCardsFilterActive: string;
  pmCardsSortBy: string;
  pmCardsSortDirection: string;
  pmCardsSortManual: string;
  pmCardsSortUpdated: string;
  pmCardsSortCreated: string;
  pmCardsSortName: string;
  pmCardsSortAsc: string;
  pmCardsSortDesc: string;
  pmCardsExpandAll: string;
  pmCardsCollapseAll: string;
  pmCardsSearchClear: string;
  pmCardsEmpty: string;
  pmCardExpand: string;
  pmCardCollapse: string;
  pmCardDetail: string;
  pmCardFavoriteAdd: string;
  pmCardFavoriteRemove: string;
  pmCardMoveUp: string;
  pmCardMoveDown: string;
  pmCardEdit: string;
  pmCardReadOnly: string;
  pmCardCopyId: string;
  pmCardMenu: string;
  pmCardArchive: string;
  pmCardUnarchive: string;
  pmCardDelete: string;
  pmCardDeleteTitle: string;
  pmCardDeleteBoardLabel: string;
  pmCardDeleteQuestion: string;
  pmCardDeleteWarnOrphans: string;
  pmCardDeleteNoDeps: string;
  pmCardDeleteConfirm: string;
  pmCardDeleteBusy: string;
  pmCardActionFailed: string;
  pmCardCancel: string;
  pmCardsPagerPrev: string;
  pmCardsPagerNext: string;
  pmCardsPagerPage: string;
  pmCardsPagerNoun: string;
  pmCardsPageSize: string;
  pmCardTasksLoading: string;
  pmCardDeleteWarnOrphansUnknown: string;
  pmCardBoardSearch: string;
  pmCardBoardSearchClear: string;
  pmCardFilterColumns: string;
  pmCardFilterAllColumns: string;
  // Sprints cards mode (boards cards parity + aops-desktop sprint grammar)
  pmSprintCardsFilterTitle: string;
  pmSprintCardsFilterLabel: string;
  pmSprintCardsFilterAll: string;
  pmSprintCardsFilterAllNote: string;
  pmSprintCardsFilterSprints: string;
  pmSprintCardsFilterSprintsNote: string;
  pmSprintCardsFilterPlans: string;
  pmSprintCardsFilterPlansNote: string;
  pmSprintCardsPagerNoun: string;
  pmSprintArchive: string;
  pmSprintUnarchive: string;
  pmSprintDelete: string;
  pmSprintDeleteTitle: string;
  pmSprintDeleteLabel: string;
  pmSprintDeleteQuestion: string;
  pmSprintDeleteWarn: string;
  pmSprintDeleteConfirm: string;
  pmSprintPaneTitle: string;
  pmSprintMicrotaskSearch: string;
  pmSprintMicrotaskSearchClear: string;
  pmFieldGoal: string;
  // Record cards (Issues/Feedback/Reviews register)
  docsCardsOpen: string;
  pmRecordViewList: string;
  pmRecordViewSidePanel: string;
  pmSprintSidePanelShow: string;
  pmSprintSidePanelHide: string;
  pmSprintSidePanelClose: string;
  pmRecordViewLabel: string;
  pmRecordDelete: string;
  pmRecordDeleteTitle: string;
  pmRecordDeleteLabel: string;
  pmRecordDeleteQuestion: string;
  pmRecordDeleteWarn: string;
  pmRecordDeleteConfirm: string;
  pmRecordsAllStatuses: string;
  pmReviewResults: string;
  pmReviewPositives: string;
  pmReviewConcerns: string;
  pmReviewObjections: string;
  pmCardTasksWord: string;
  pmCardColumnsWord: string;
  pmCardStatsLabel: string;
  pmCardPaneTitle: string;
  pmCardPaneClose: string;
  pmCardPaneColumns: string;
  pmCardPaneNoDescription: string;
  pmFieldCreated: string;
  // Sprints navigator
  pmNavSprintsGroup: string;
  pmNavPlansGroup: string;
  pmNavUntitled: string;
  pmNavSearchSprints: string;
  pmNavFilterSprints: string;
  pmNavSprintTools: string;
  pmNavSprintsPane: string;
  pmNavNoSprints: string;
  pmNavNothingMatches: string;
  pmNavSprintsPanelTitle: string;
  pmNavSprintK: string;
  pmNavSelect: string;
  // Projects navigator
  projectsNavUnknownStatus: string;
  projectsNavUntitled: string;
  projectsNavSearch: string;
  projectsNavFilter: string;
  projectsNavTools: string;
  projectsNavPane: string;
  projectsNavEmpty: string;
  projectsNavEmptySearch: string;
  projectsNavAll: string;
  projectsNavPanelTitle: string;
  projectsNavFavoritesRecentTitle: string;
  projectsNavRecents: string;
  projectsNavRecentsEmpty: string;
  projectsNavRecentsRemove: string;
  // Agentspace A2 dispatcher
  navAgentspace: string;
  asEyebrow: string;
  asTitle: string;
  asHeaderNote: string;
  asSectionMemory: string;
  asSectionMissions: string;
  asSectionDiscussions: string;
  asSectionPrompts: string;
  asSectionSkills: string;
  asSectionArtifacts: string;
  asSectionResources: string;
  asSectionAgents: string;
  asNoProjectTitle: string;
  asNoProjectMessage: string;
  asLoadingTitle: string;
  asLoadingMessage: string;
  asErrorTitle: string;
  asEmptyTitle: string;
  asEmptyMessage: string;
  asSearchMemory: string;
  asSearchMissions: string;
  asSearchDiscussions: string;
  asSearchPrompts: string;
  asSearchSkills: string;
  asSearchArtifacts: string;
  asSearchResources: string;
  asSearchAgents: string;
  asNoRecords: string;
  asFieldKind: string;
  asFieldDurability: string;
  asFieldImportance: string;
  asFieldSource: string;
  asFieldSlug: string;
  asFieldObjective: string;
  asFieldTaskDefinition: string;
  asFieldActivePlan: string;
  asFieldParticipants: string;
  asFieldLastTurn: string;
  asFieldLastSeq: string;
  asFieldRules: string;
  asFieldBlockedOn: string;
  asAttentionBlocked: string;
  asFieldReplyTo: string;
  asFieldAddressedTo: string;
  asFieldOutputOwner: string;
  asFieldQuestion: string;
  asFieldDescription: string;
  asFieldCurrentVersion: string;
  asFieldResourceType: string;
  asFieldRef: string;
  asFieldUri: string;
  asArtifactsGapTitle: string;
  asArtifactsGapMessage: string;
  asFieldArtifactType: string;
  asFieldMimeType: string;
  asFieldSize: string;
  asFieldStoragePath: string;
  asFieldRole: string;
  asFieldCapabilities: string;
  asFieldUpdated: string;
  asFilterAll: string;
  asMemoryViewLabel: string;
  asMemoryViewTimeline: string;
  asMemoryViewCards: string;
  asMemoryViewRead: string;
  asMemoryViewDigest: string;
  asMemoryMap: string;
  asMemoryBlocks: string;
  asMemoryTimeline: string;
  asMemoryNewestFirst: string;
  asMemoryAllKinds: string;
  asMemoryDaysShown: string;
  asMemoryBlock: string;
  asMemoryNeighbors: string;
  asMemoryOlder: string;
  asMemoryNewer: string;
  asMemorySortBy: string;
  asMemorySortUpdated: string;
  asMemorySortCreated: string;
  asMemorySortKind: string;
  asMemorySortImportance: string;
  asMemoryCreated: string;
  asMemoryContent: string;
  asMemoryTags: string;
  asMemoryScope: string;
  asMemoryByKind: string;
  asMemoryLatest: string;
  asMemoryShowMore: string;
  asOpenDigestPane: string;
  asCloseDigestPane: string;
  asPageLoadMore: string;
  asFieldRoles: string;
  asFieldSuccessCriteria: string;
  asFieldConstraints: string;
  asOpenPlanInPm: string;
  asTurns: string;
  asNoTurns: string;
  asOutputs: string;
  asOutputKindDecision: string;
  asOutputKindConsensus: string;
  asOutputKindDisagreement: string;
  asOutputKindOpenQuestions: string;
  asOutputKindFinalStance: string;
  asDiscussionTurnOrder: string;
  asDiscussionMinTurns: string;
  asDiscussionRequireQuestionAnswer: string;
  asVersionBody: string;
  // Docs (Docman A1)
  navDocs: string;
  docsEyebrow: string;
  docsTitle: string;
  docsHeaderNote: string;
  docsLoadingTitle: string;
  docsErrorTitle: string;
  docsEmptyTitle: string;
  docsEmptyMessage: string;
  docsNoContent: string;
  docsNavPanelTitle: string;
  docsNavPane: string;
  docsNavTools: string;
  docsNavSearch: string;
  docsNavFilter: string;
  docsNavEmpty: string;
  docsNavEmptySearch: string;
  docsNavUntitled: string;
  docsNavUngrouped: string;
  docsNavDocK: string;
  docsNavSelectDoc: string;
  docsOutline: string;
  docsVersions: string;
  pmGroupNone: string;
  pmGroupColumn: string;
  pmGroupSprint: string;
  pmNoSprint: string;
  pmPhasesTab: string;
  pmReferencesTab: string;
  pmTasksTab: string;
  pmPhaseView: string;
  pmPhaseTimeline: string;
  pmPhaseAccordion: string;
  pmPhaseTable: string;
  pmTimelineEyebrow: string;
  pmTimelineTitle: string;
  pmTimelineSubtitle: string;
  pmTimelineProgress: string;
  pmTimelineCurrent: string;
  pmTimelineNext: string;
  pmTimelineComplete: string;
  pmTimelineUpcoming: string;
  pmTimelineBlocked: string;
  pmTimelineUnplanned: string;
  pmTimelineFinished: string;
  pmTimelineFinishLine: string;
  pmTimelineCompletedTasks: string;
  pmTimelineCompletedPhases: string;
  pmTimelinePhase: string;
  pmTimelineTasks: string;
  pmTimelineNoTasks: string;
  pmPhaseChecklistItem: string;
  pmPhaseNotes: string;
  pmSeverity: string;
  pmSource: string;
  pmType: string;
  pmPriority: string;
  pmScope: string;
  pmDescription: string;
  pmInstructions: string;
  pmSearchIssues: string;
  pmSearchFeedback: string;
  pmSearchReviews: string;
  pmNoIssues: string;
  pmNoFeedback: string;
  pmNoReviews: string;
  pmOverviewTitle: string;
  pmTasksTitle: string;
  pmBoardsTitle: string;
  pmSprintsPlansTitle: string;
  pmContextTitle: string;
  pmBoards: string;
  pmTasks: string;
  pmSprints: string;
  pmPlans: string;
  pmIssues: string;
  pmFeedback: string;
  pmReviews: string;
  pmOpenItems: string;
  pmRequestedReviews: string;
  pmLatestTasks: string;
  pmReviewQueue: string;
  pmIssueQueue: string;
  pmNoRows: string;
  pmArchiveFilter: string;
  pmFilterActive: string;
  pmFilterArchived: string;
  pmBoardSelect: string;
  pmBoardViewMode: string;
  pmBoardModeKanban: string;
  pmBoardModeTable: string;
  pmBoardSummary: string;
  pmCompleted: string;
  pmNoArchivedBoards: string;
  pmPlanTypeFilter: string;
  pmFilterAllPlanTypes: string;
  pmSprintType: string;
  pmPlanType: string;
  pmPlanDetailTitle: string;
  pmLoadingDetail: string;
  pmPlanNoGoal: string;
  pmFieldLinkedTask: string;
  pmScopeTitle: string;
  pmValidationTitle: string;
  pmNoArchivedPlans: string;
  pmPhasesEmpty: string;
  pmTaskBoardFilter: string;
  pmTaskSprintFilter: string;
  pmFilterAllBoards: string;
  pmFilterAllSprints: string;
  pmCountVisible: string;
  pmTaskDetailTitle: string;
  pmTaskDrilldownBack: string;
  pmTaskNoDescription: string;
  pmFieldId: string;
  pmFieldBoard: string;
  pmFieldColumn: string;
  pmFieldSprint: string;
  pmFieldProgress: string;
  pmFieldStatus: string;
  pmUnassigned: string;
  pmUnknownStatus: string;
  contentCopy: string;
  contentCopied: string;
  contentCopyFailed: string;
  // M1 shell chrome (eops-desktop parity)
  themeLight: string;
  themeDark: string;
  a11ySectionSwitch: string;
  a11yLocaleSwitch: string;
  a11yNavToggle: string;
  // Sidebar (DesktopSidebar) header controls + footer reopen — eops parity
  navCollapse: string;
  navExpand: string;
  navHide: string;
  navHideHint: string;
  navHeaderControls: string;
  navReopen: string;
  navPin: string;
  navUnpin: string;
  statusReady: string;
  brandTitle: string;
  brandSubtitle: string;
  authChecking: string;
  authStatusActive: string;
  statusApi: string;
  statusProject: string;
  statusNoProject: string;
  // M2 theme-studio
  themeStudioTitle: string;
  themeStudioSubtitle: string;
  themeStudioClose: string;
  themeStudioBuiltin: string;
  themeStudioCustom: string;
  themeStudioUse: string;
  themeStudioActive: string;
  themeStudioNew: string;
  themeStudioCopy: string;
  themeStudioEdit: string;
  themeStudioDelete: string;
  themeStudioMode: string;
  themeStudioAccent: string;
  themeStudioName: string;
  themeStudioLightColors: string;
  themeStudioDarkColors: string;
  themeStudioColorCanvas: string;
  themeStudioColorSurface: string;
  themeStudioColorText: string;
  themeStudioVariants: string;
  themeStudioVariantSecondary: string;
  themeStudioVariantTertiary: string;
  themeStudioVariantLabel: string;
  themeStudioAddVariant: string;
  themeStudioRemoveVariant: string;
  themeStudioReadonlyNote: string;
  themeStudioDone: string;
  // Sessions / Chat
  chatEyebrow: string;
  chatTitle: string;
  chatHeaderNote: string;
  chatStatusIdle: string;
  chatStatusConnecting: string;
  chatStatusConnected: string;
  chatStatusError: string;
  chatConnectTitle: string;
  chatConnectMessage: string;
  chatChannelLockedTitle: string;
  chatChannelLockedMessage: string;
  chatChannelPinLockedTitle: string;
  chatChannelPinLockedMessage: string;
  chatChannelStaleTitle: string;
  chatChannelStaleMessage: string;
  chatChannelRecoverableTitle: string;
  chatChannelRecoverableMessage: string;
  chatRecoveryErrorLabel: string;
  chatRecoveryPinLabel: string;
  chatRecoveryPinRequired: string;
  chatUnlockWithPin: string;
  chatPasteInvite: string;
  chatNoRoomTitle: string;
  chatNoRoomMessage: string;
  chatSpacesTitle: string;
  chatSpacesBandLabel: string;
  chatSpacesBandScope: string;
  chatSpacesLoading: string;
  chatSpacesEmpty: string;
  chatSpacesUnavailable: string;
  chatSpacesManage: string;
  chatSpacesManageTitle: string;
  chatSpacesManageIntro: string;
  chatSpacesReadOnlyNote: string;
  chatSpacesRenameUnsupported: string;
  chatSpaceCreateTitle: string;
  chatSpaceTitleLabel: string;
  chatSpaceTitlePlaceholder: string;
  chatSpaceSlugPreview: string;
  chatSpaceCreate: string;
  chatSpaceCreating: string;
  chatSpaceArchive: string;
  chatSpaceArchiving: string;
  chatSpaceDefaultArchiveDisabled: string;
  chatSpaceArchiveMissingId: string;
  chatSpaceListEmpty: string;
  chatChannelsLabel: string;
  chatRoomsLabel: string;
  chatActiveRoom: string;
  chatMessageCount: string;
  chatRefresh: string;
  chatSearchPlaceholder: string;
  chatNoChannelsNav: string;
  chatNoChannelsSearch: string;
  chatNewChannel: string;
  chatJoinChannel: string;
  chatCreateTab: string;
  chatJoinTab: string;
  chatHandle: string;
  chatChannelName: string;
  chatChannelNamePh: string;
  chatEncryptionMode: string;
  chatEncryptionServer: string;
  chatEncryptionServerHint: string;
  chatEncryptionE2e: string;
  chatEncryptionE2eShort: string;
  chatEncryptionE2eHint: string;
  chatChannelRules: string;
  chatChannelRulesPh: string;
  chatInvite: string;
  chatInvitePh: string;
  chatCreate: string;
  chatJoin: string;
  chatCancel: string;
  chatConnectPanelTitle: string;
  // Message timeline + composer
  chatEmpty: string;
  chatDayToday: string;
  chatDayYesterday: string;
  chatUnreadDivider: string;
  chatRead: string;
  chatDelivered: string;
  chatCopied: string;
  chatCopyRef: string;
  chatAckShort: string;
  chatAcknowledge: string;
  chatAcknowledged: string;
  chatYou: string;
  chatLockedHint: string;
  chatLockedNeedsPinHint: string;
  chatLockedRecoverableHint: string;
  chatLockedStaleHint: string;
  chatComposerPlaceholder: string;
  chatComposerSend: string;
  chatComposerEnc: string;
  chatComposerKindLabel: string;
  chatKindMessage: string;
  chatKindDirective: string;
  chatKindQuestion: string;
  chatKindDecision: string;
  chatKindStatus: string;
  // Rules modal + refs
  chatRulesOpen: string;
  chatRulesTitle: string;
  chatRulesChannel: string;
  chatRulesRoom: string;
  chatRulesEmpty: string;
  chatClose: string;
  chatRefsTitle: string;
  chatRefsEmpty: string;
  chatRefsCopy: string;
  chatRefsToggle: string;
  // S4 CRUD
  chatNewRoom: string;
  chatRoomName: string;
  chatRoomNamePh: string;
  chatRoomRules: string;
  chatCreateRoom: string;
  chatActions: string;
  chatArchiveRoom: string;
  chatDeleteRoom: string;
  chatArchiveChannel: string;
  chatUnarchiveChannel: string;
  chatDeleteChannel: string;
  chatLeaveChannel: string;
  chatDeleteConfirmTitle: string;
  chatDeleteConfirmMessage: string;
  chatDeleteConfirmSlugLabel: string;
  chatDelete: string;
  chatArchivedBadge: string;
  chatRenameUnsupported: string;
  chatChannelSection: string;
  chatRoomSection: string;
  // Navigator gear (mode / layout switch — projects parity)
  chatNavSettings: string;
  chatNavMode: string;
  chatNavModeNavigator: string;
  chatNavModeLeftMenu: string;
  chatNavReopen: string;
  chatBackToChannels: string;
  chatNavPanelTitle: string;
  // A1 record-detail workbench tabs
  chatRecordEyebrow: string;
  chatEpochShort: string;
  chatTabMessages: string;
  chatTabMembers: string;
  chatTabReferences: string;
  chatTabRules: string;
  chatTabActivity: string;
  chatPresenceOnline: string;
  chatMembersOnline: string;
  chatMemberRailExpand: string;
  chatMemberRailCollapse: string;
  // Members tab
  chatMembersEmpty: string;
  chatMemberRemove: string;
  chatMemberRemoveConfirm: string;
  chatMemberYou: string;
  chatMemberRemoved: string;
  chatMemberReadUpTo: string;
  chatMemberDeliveredUpTo: string;
  chatPresenceActive: string;
  chatPresenceIdle: string;
  chatPresenceOffline: string;
  chatInviteHint: string;
  chatInviteAction: string;
  chatInviteUnavailable: string;
  chatCopyInvite: string;
  chatInviteCopied: string;
  // Activity tab
  chatActivityDirective: string;
  chatActivityNoDirective: string;
  chatActivityAcked: string;
  chatActivityEpoch: string;
  chatActivityPresenceTitle: string;
  chatActivityRoomMeta: string;
  chatActivityAcknowledged: string;
  chatActivityPending: string;
  // M3 footer/log
  debugTitle: string;
  debugEyebrow: string;
  debugClear: string;
  debugClose: string;
  debugLogs: string;
  debugIssues: string;
  debugFilterAll: string;
  debugFilterIssues: string;
  debugEmpty: string;
}

export type AopsCockpitTranslationKey = keyof AopsCockpitTags;
export type AopsCockpitLocale = "en" | "tr";

const resources = {
  tags: {
    appTitle: { en: "AOPS Cockpit v2", tr: "AOPS Kokpit v2" },
    appShort: { en: "AOPS", tr: "AOPS" },
    webMode: { en: "Web cockpit", tr: "Web kokpit" },
    navLandmark: { en: "Cockpit sections", tr: "Kokpit bölümleri" },
    navProjects: { en: "Projects", tr: "Projeler" },
    navProjectman: { en: "PM", tr: "PM" },
    navSessions: { en: "Sessions", tr: "Oturumlar" },
    navChat: { en: "Chat", tr: "Sohbet" },
    dockPinned: { en: "Pinned navigation", tr: "Sabit navigasyon" },
    dockCompact: { en: "Compact navigation", tr: "Kompakt navigasyon" },
    localeToggle: { en: "Switch language", tr: "Dili değiştir" },
    projectsEyebrow: { en: "Projects", tr: "Projeler" },
    projectsTitle: { en: "Project Inventory", tr: "Proje Envanteri" },
    projectsHeaderNote: { en: "Hosted project context", tr: "Hosted proje bağlamı" },
    projectsReadyTitle: { en: "Projects surface", tr: "Proje yuzeyi" },
    projectsReadyMessage: { en: "Registry route active", tr: "Registry rotasi aktif" },
    projectsRegistryBadge: { en: "ui-plugin registry", tr: "ui-plugin registry" },
    authCheckingTitle: { en: "Checking session", tr: "Oturum kontrol ediliyor" },
    authCheckingMessage: { en: "AOPS host session", tr: "AOPS host oturumu" },
    authErrorTitle: { en: "Session unavailable", tr: "Oturum kullanılamıyor" },
    authRetry: { en: "Retry", tr: "Tekrar dene" },
    authProviderTrusted: { en: "Trusted local", tr: "Güvenilir yerel" },
    projectsRefresh: { en: "Refresh", tr: "Yenile" },
    projectsLoadingTitle: { en: "Loading projects", tr: "Projeler yükleniyor" },
    projectsLoadingMessage: { en: "Reading hosted inventory", tr: "Hosted envanter okunuyor" },
    projectsErrorTitle: { en: "Projects unavailable", tr: "Projeler kullanılamıyor" },
    projectsEmptyTitle: { en: "No projects", tr: "Proje yok" },
    projectsEmptyMessage: { en: "No visible hosted projects", tr: "Görünür hosted proje yok" },
    projectsListLabel: { en: "Project list", tr: "Proje listesi" },
    projectDetailTitle: { en: "Project detail", tr: "Proje detayı" },
    projectDetailTabsLabel: { en: "Project detail sections", tr: "Proje detay sekmeleri" },
    projectTabOverview: { en: "Overview", tr: "Özet" },
    projectTabOverviewHint: { en: "Identity and hosted scope", tr: "Kimlik ve hosted kapsam" },
    projectTabActivity: { en: "Timeline", tr: "Akış" },
    projectTabActivityHint: { en: "Cross-domain recent changes", tr: "Domainler arası son değişiklikler" },
    projectTabPlanning: { en: "Planning", tr: "Planlama" },
    projectTabPlanningHint: { en: "Boards, tasks, sprints", tr: "Panolar, görevler, sprintler" },
    projectTabMemory: { en: "Memory", tr: "Hafıza" },
    projectTabMemoryHint: { en: "Durable project context", tr: "Kalıcı proje bağlamı" },
    projectTabDocs: { en: "Docs", tr: "Dokümanlar" },
    projectTabDocsHint: { en: "Docman assets", tr: "Docman varlıkları" },
    projectOverviewTitle: { en: "Project info", tr: "Proje bilgisi" },
    projectOverviewMessage: {
      en: "Core hosted project identity for the selected register row.",
      tr: "Seçili kayıt satırı için temel hosted proje kimliği."
    },
    projectPlanningTitle: { en: "Projectman context", tr: "Projectman bağlamı" },
    projectPlanningMessage: {
      en: "Boards, tasks, sprints, review requests, and issues use this selected project scope.",
      tr: "Panolar, görevler, sprintler, inceleme istekleri ve sorunlar bu seçili proje kapsamını kullanır."
    },
    projectMemoryTitle: { en: "Agentspace memory", tr: "Agentspace hafızası" },
    projectMemoryMessage: {
      en: "Durable handoffs, decisions, and resume notes are read by project scope.",
      tr: "Kalıcı handoff, karar ve resume notları proje kapsamına göre okunur."
    },
    projectDocsTitle: { en: "Docman documents", tr: "Docman dokümanları" },
    projectDocsMessage: {
      en: "Documents and current versions are filtered through the selected project context.",
      tr: "Dokümanlar ve güncel versiyonlar seçili proje bağlamıyla filtrelenir."
    },
    projectOpenPlanning: { en: "Open PM", tr: "PM'i aç" },
    projectOpenPlan: { en: "Open plan", tr: "Planı aç" },
    projectOpenMemory: { en: "Open Memory", tr: "Hafızayı aç" },
    projectOpenDocs: { en: "Open Docs", tr: "Dokümanları aç" },
    projectLatestPlan: { en: "Latest plan or sprint", tr: "Son plan veya sprint" },
    projectLatestMemory: { en: "Latest memory", tr: "Son hafıza kaydı" },
    projectLatestDocs: { en: "Latest document", tr: "Son doküman" },
    projectSummaryLoading: { en: "Summary is loading for this project.", tr: "Bu proje için özet yükleniyor." },
    projectSummaryError: { en: "Summary data is unavailable right now.", tr: "Özet verisi şu anda kullanılamıyor." },
    projectSummaryEmpty: { en: "No records yet for this project section.", tr: "Bu proje bölümü için henüz kayıt yok." },
    projectPulseTitle: { en: "Project pulse", tr: "Proje nabzı" },
    projectPulseMessage: {
      en: "A live, project-scoped snapshot across the AOPS owner domains.",
      tr: "AOPS owner domainlerinde proje kapsamlı canlı durum özeti."
    },
    projectPulseOpenWork: { en: "Open work", tr: "Açık işler" },
    projectPulsePendingReviews: { en: "Pending reviews", tr: "Bekleyen incelemeler" },
    projectPulseActiveMissions: { en: "Active missions", tr: "Aktif misyonlar" },
    projectPulseRunningRuns: { en: "Running runs", tr: "Çalışan koşular" },
    projectDomainProjectman: { en: "Projectman", tr: "Projectman" },
    projectDomainAgentspace: { en: "Agentspace", tr: "Agentspace" },
    projectDomainDocman: { en: "Docman", tr: "Docman" },
    projectDomainRunner: { en: "Runner", tr: "Runner" },
    projectDomainReady: { en: "Ready", tr: "Hazır" },
    projectDomainLoading: { en: "Loading", tr: "Yükleniyor" },
    projectDomainError: { en: "Unavailable", tr: "Kullanılamıyor" },
    projectDomainEmpty: { en: "No records", tr: "Kayıt yok" },
    projectDomainLatest: { en: "Latest change", tr: "Son değişiklik" },
    projectActivityTitle: { en: "Cross-domain timeline", tr: "Domainler arası zaman akışı" },
    projectActivityMessage: {
      en: "Projectman, Agentspace, Docman, and Runner records ordered by their latest timestamps.",
      tr: "Projectman, Agentspace, Docman ve Runner kayıtları son zaman damgalarına göre sıralanır."
    },
    projectActivitySnapshotNote: {
      en: "This is a recent-change view composed from current read models, not an audit log.",
      tr: "Bu görünüm güncel okuma modellerinden üretilen son değişiklik akışıdır; denetim günlüğü değildir."
    },
    projectActivityRangeLabel: { en: "Time range", tr: "Zaman aralığı" },
    projectActivityRangeDay: { en: "24 hours", tr: "24 saat" },
    projectActivityRangeWeek: { en: "7 days", tr: "7 gün" },
    projectActivityRangeMonth: { en: "30 days", tr: "30 gün" },
    projectActivityRangeAll: { en: "All time", tr: "Tümü" },
    projectActivityTotal: { en: "Total changes", tr: "Toplam değişiklik" },
    projectActivityVisible: { en: "In range", tr: "Aralıkta" },
    projectActivityDomains: { en: "Active domains", tr: "Aktif domain" },
    projectActivityLatest: { en: "Latest", tr: "En son" },
    projectActivityEmpty: { en: "No changes in this time range.", tr: "Bu zaman aralığında değişiklik yok." },
    projectActivityOpen: { en: "Open section", tr: "Bölümü aç" },
    projectActivityChanges: { en: "changes", tr: "değişiklik" },
    projectLatestDayTitle: { en: "Latest active day", tr: "Son aktif gün" },
    projectLatestDayMessage: {
      en: "Latest project records across owner domains.",
      tr: "Owner domainlerdeki en son proje kayıtları."
    },
    projectLatestDayOpenAll: { en: "Open full timeline", tr: "Tüm akışı aç" },
    projectLatestDayEmpty: {
      en: "No project activity is available yet.",
      tr: "Henüz proje hareketi bulunmuyor."
    },
    projectDocGroups: { en: "Groups", tr: "Gruplar" },
    projectReferences: { en: "Project references", tr: "Proje referansları" },
    projectSlug: { en: "Slug", tr: "Slug" },
    projectKey: { en: "Key", tr: "Anahtar" },
    projectStatus: { en: "Status", tr: "Durum" },
    projectVisibility: { en: "Visibility", tr: "Görünürlük" },
    projectType: { en: "Type", tr: "Tip" },
    projectScope: { en: "Scope", tr: "Scope" },
    projectId: { en: "Project ID", tr: "Proje ID" },
    projectSelected: { en: "Selected", tr: "Seçili" },
    projectCount: { en: "Projects", tr: "Projeler" },
    unknownValue: { en: "Unknown", tr: "Bilinmiyor" },
    pmTitle: { en: "PM Workbench", tr: "PM Workbench" },
    pmHeaderNote: { en: "Project-scoped PM read surface", tr: "Proje kapsamlı PM okuma yüzeyi" },
    pmHeaderProjectId: { en: "Project Id", tr: "Proje Id" },
    pmSelectedProject: { en: "Project", tr: "Proje" },
    pmRefresh: { en: "Refresh", tr: "Yenile" },
    pmNoProjectTitle: { en: "No project selected", tr: "Proje seçili değil" },
    pmNoProjectMessage: { en: "Select a project to read Projectman records", tr: "Projectman kayıtlarını okumak için proje seçin" },
    pmLoadingTitle: { en: "Loading Projectman", tr: "Projectman yükleniyor" },
    pmLoadingMessage: { en: "Reading hosted PM records", tr: "Hosted PM kayıtları okunuyor" },
    pmErrorTitle: { en: "Projectman unavailable", tr: "Projectman kullanılamıyor" },
    pmEmptyTitle: { en: "No PM records", tr: "PM kaydı yok" },
    pmEmptyMessage: { en: "No Projectman records for the selected project", tr: "Seçili proje için Projectman kaydı yok" },
    pmTabOverview: { en: "Overview", tr: "Özet" },
    pmTabTasks: { en: "Tasks", tr: "Görevler" },
    pmTabBoards: { en: "Boards", tr: "Panolar" },
    pmTabSprintsPlans: { en: "Sprints/Plans", tr: "Sprintler/Planlar" },
    pmSectionBoards: { en: "Boards", tr: "Panolar" },
    pmSectionSprints: { en: "Sprints", tr: "Sprintler" },
    pmSectionIssues: { en: "Issues", tr: "Sorunlar" },
    pmSectionFeedback: { en: "Feedback", tr: "Geri Bildirim" },
    pmSectionReviews: { en: "Reviews", tr: "İncelemeler" },
    pmBandProject: { en: "Project", tr: "Proje" },
    pmBandProjectScope: { en: "Project · hosted scope", tr: "Proje · barındırılan kapsam" },
    pmActionBack: { en: "Back to projects", tr: "Projelere dön" },
    pmActionMore: { en: "More actions", tr: "Diğer işlemler" },
    pmActionRefreshData: { en: "Refresh data", tr: "Veriyi yenile" },
    pmActionGoProjects: { en: "Go to Projects", tr: "Projelere git" },
    pmGroupBy: { en: "Group", tr: "Grupla" },
    pmFieldUpdated: { en: "Updated", tr: "Güncelleme" },
    pmRollupTodo: { en: "Todo", tr: "Yapılacak" },
    pmRollupDoing: { en: "Doing", tr: "Sürüyor" },
    pmRollupBlocked: { en: "Blocked", tr: "Engelli" },
    pmRollupPaused: { en: "Paused", tr: "Duraklatıldı" },
    pmRollupInReview: { en: "In Review", tr: "İncelemede" },
    pmRollupPostponed: { en: "Postponed", tr: "Ertelendi" },
    pmRollupCancelled: { en: "Cancelled", tr: "İptal" },
    pmRollupCompleted: { en: "Completed", tr: "Tamamlandı" },
    navSettings: { en: "View settings", tr: "Görünüm ayarları" },
    navMode: { en: "Mode", tr: "Mod" },
    navModeNavigator: { en: "Navigator", tr: "Navigatör" },
    navModeLeftMenu: { en: "Left menu", tr: "Sol menü" },
    navModeDropdown: { en: "Dropdown", tr: "Açılır liste" },
    navModeCards: { en: "Cards", tr: "Kartlar" },
    navPaneReopen: { en: "Show navigator", tr: "Navigatörü göster" },
    navSidePanelShow: { en: "Show side panel", tr: "Yan paneli göster" },
    navSidePanelHide: { en: "Hide side panel", tr: "Yan paneli gizle" },
    navSidePanelClose: { en: "Close side panel", tr: "Yan paneli kapat" },
    navArchivedGroup: { en: "Archived", tr: "Arşiv" },
    navActiveGroup: { en: "Active", tr: "Aktif" },
    pmNavActiveBoards: { en: "Active boards", tr: "Aktif panolar" },
    pmNavUntitledBoard: { en: "Untitled board", tr: "Adsız pano" },
    pmNavSearchBoards: {
      en: "Search boards, TASK-92 or task content",
      tr: "Pano, TASK-92 veya görev içeriği ara"
    },
    pmNavFilterBoards: { en: "Filter boards", tr: "Panoları filtrele" },
    pmNavBoardTools: { en: "Board navigator tools", tr: "Pano navigatör araçları" },
    pmNavBoardsPane: { en: "Boards navigator", tr: "Panolar navigatörü" },
    pmNavNoBoards: { en: "No boards", tr: "Pano yok" },
    pmNavNoBoardsMatch: { en: "No boards match your search", tr: "Aramayla eşleşen pano yok" },
    pmNavBoardsPanelTitle: { en: "Boards", tr: "Panolar" },
    pmNavBoardK: { en: "Board", tr: "Pano" },
    pmNavSelectBoard: { en: "Select board", tr: "Pano seç" },
    pmCardsToolbar: { en: "Card list toolbar", tr: "Kart listesi araç çubuğu" },
    pmCardsFilterTitle: { en: "Board filters", tr: "Pano filtreleri" },
    pmCardsFilterScope: { en: "Current scope", tr: "Geçerli kapsam" },
    pmCardsFilterLabel: { en: "Board list", tr: "Pano listesi" },
    pmCardsFilterAll: { en: "All boards", tr: "Tüm panolar" },
    pmCardsFilterAllNote: {
      en: "Show every board in the current project scope.",
      tr: "Geçerli proje kapsamındaki tüm panoları göster."
    },
    pmCardsFilterFavorites: { en: "Favorites only", tr: "Sadece favoriler" },
    pmCardsFilterFavoritesNote: {
      en: "Keep only favorites in the list.",
      tr: "Listede yalnızca favorileri tut."
    },
    pmCardsFilterWithTasks: { en: "Boards with tasks", tr: "Görevi olan panolar" },
    pmCardsFilterWithTasksNote: {
      en: "Hide empty boards from the list.",
      tr: "Boş panoları listeden gizle."
    },
    pmCardsFilterClear: { en: "Clear", tr: "Temizle" },
    pmCardsFilterActive: { en: "Active filter", tr: "Aktif filtre" },
    pmCardsSortBy: { en: "Sort by", tr: "Sırala" },
    pmCardsSortDirection: { en: "Sort direction", tr: "Sıralama yönü" },
    pmCardsSortManual: { en: "Manual order", tr: "Elle sıralama" },
    pmCardsSortUpdated: { en: "Updated date", tr: "Güncellenme tarihi" },
    pmCardsSortCreated: { en: "Created date", tr: "Oluşturulma tarihi" },
    pmCardsSortName: { en: "Name", tr: "Ad" },
    pmCardsSortAsc: { en: "Ascending", tr: "Artan" },
    pmCardsSortDesc: { en: "Descending", tr: "Azalan" },
    pmCardsExpandAll: { en: "Expand all", tr: "Tümünü aç" },
    pmCardsCollapseAll: { en: "Collapse all", tr: "Tümünü kapat" },
    pmCardsSearchClear: { en: "Clear search", tr: "Aramayı temizle" },
    pmCardsEmpty: {
      en: "No boards match the current filter",
      tr: "Geçerli filtreyle eşleşen pano yok"
    },
    pmCardExpand: { en: "Expand", tr: "Genişlet" },
    pmCardCollapse: { en: "Collapse", tr: "Daralt" },
    pmCardDetail: { en: "Details", tr: "Detay" },
    pmCardFavoriteAdd: { en: "Add to favorites", tr: "Favorilere ekle" },
    pmCardFavoriteRemove: { en: "Remove from favorites", tr: "Favorilerden kaldır" },
    pmCardMoveUp: { en: "Move up", tr: "Yukarı taşı" },
    pmCardMoveDown: { en: "Move down", tr: "Aşağı taşı" },
    pmCardEdit: { en: "Edit", tr: "Düzenle" },
    pmCardReadOnly: { en: "Read-only cockpit", tr: "Salt okunur kokpit" },
    pmCardCopyId: { en: "Copy id", tr: "Kimliği kopyala" },
    pmCardMenu: { en: "Record actions", tr: "Kayıt işlemleri" },
    pmCardArchive: { en: "Archive board", tr: "Panoyu arşivle" },
    pmCardUnarchive: { en: "Unarchive board", tr: "Panoyu arşivden çıkar" },
    pmCardDelete: { en: "Delete board", tr: "Panoyu sil" },
    pmCardDeleteTitle: { en: "Delete Board", tr: "Panoyu Sil" },
    pmCardDeleteBoardLabel: { en: "Board", tr: "Pano" },
    pmCardDeleteQuestion: {
      en: "This permanently deletes the board. This cannot be undone.",
      tr: "Bu işlem panoyu kalıcı olarak siler ve geri alınamaz."
    },
    pmCardDeleteWarnOrphans: {
      en: "Linked records are NOT deleted: {tasks} tasks and {columns} column links stay in the database orphaned (they disappear from board views).",
      tr: "Bağlı kayıtlar SİLİNMEZ: {tasks} görev ve {columns} kolon bağlantısı veritabanında sahipsiz kalır (pano görünümlerinden kaybolur)."
    },
    pmCardDeleteNoDeps: {
      en: "This board has no linked tasks.",
      tr: "Bu panoya bağlı görev yok."
    },
    pmCardDeleteConfirm: { en: "Delete Board", tr: "Panoyu Sil" },
    pmCardDeleteBusy: { en: "Deleting…", tr: "Siliniyor…" },
    pmCardActionFailed: { en: "Action failed", tr: "İşlem başarısız" },
    pmCardCancel: { en: "Cancel", tr: "Vazgeç" },
    pmCardsPagerPrev: { en: "Prev", tr: "Önceki" },
    pmCardsPagerNext: { en: "Next", tr: "Sonraki" },
    pmCardsPagerPage: { en: "Page", tr: "Sayfa" },
    pmCardsPagerNoun: { en: "boards", tr: "pano" },
    pmCardsPageSize: { en: "Per page", tr: "Sayfa başına" },
    pmCardTasksLoading: { en: "Loading tasks…", tr: "Görevler yükleniyor…" },
    pmCardDeleteWarnOrphansUnknown: {
      en: "Linked records are NOT deleted: any tasks and column links of this board stay in the database orphaned (they disappear from board views).",
      tr: "Bağlı kayıtlar SİLİNMEZ: bu panonun görevleri ve kolon bağlantıları veritabanında sahipsiz kalır (pano görünümlerinden kaybolur)."
    },
    pmCardBoardSearch: { en: "Search tasks", tr: "Görevlerde ara" },
    pmCardBoardSearchClear: { en: "Clear task search", tr: "Görev aramasını temizle" },
    pmCardFilterColumns: { en: "Column filter", tr: "Kolon filtresi" },
    pmCardFilterAllColumns: { en: "All columns", tr: "Tüm kolonlar" },
    pmSprintCardsFilterTitle: { en: "Record filters", tr: "Kayıt filtreleri" },
    pmSprintCardsFilterLabel: { en: "Record list", tr: "Kayıt listesi" },
    pmSprintCardsFilterAll: { en: "All records", tr: "Tüm kayıtlar" },
    pmSprintCardsFilterAllNote: {
      en: "Show sprints and implementation plans together.",
      tr: "Sprintleri ve uygulama planlarını birlikte göster."
    },
    pmSprintCardsFilterSprints: { en: "Sprints only", tr: "Sadece sprintler" },
    pmSprintCardsFilterSprintsNote: {
      en: "Hide implementation plans from the list.",
      tr: "Uygulama planlarını listeden gizle."
    },
    pmSprintCardsFilterPlans: { en: "Plans only", tr: "Sadece planlar" },
    pmSprintCardsFilterPlansNote: {
      en: "Hide sprints from the list.",
      tr: "Sprintleri listeden gizle."
    },
    pmSprintCardsPagerNoun: { en: "records", tr: "kayıt" },
    pmSprintArchive: { en: "Archive sprint", tr: "Sprinti arşivle" },
    pmSprintUnarchive: { en: "Unarchive sprint", tr: "Sprinti arşivden çıkar" },
    pmSprintDelete: { en: "Delete sprint", tr: "Sprinti sil" },
    pmSprintDeleteTitle: { en: "Delete Sprint", tr: "Sprinti Sil" },
    pmSprintDeleteLabel: { en: "Sprint", tr: "Sprint" },
    pmSprintDeleteQuestion: {
      en: "This permanently deletes the sprint document. This cannot be undone.",
      tr: "Bu işlem sprint dokümanını kalıcı olarak siler ve geri alınamaz."
    },
    pmSprintDeleteWarn: {
      en: "The sprint's phases and checklist items are deleted with the document; the linked kanban task is NOT deleted.",
      tr: "Sprintin fazları ve checklist maddeleri dokümanla birlikte silinir; bağlı kanban görevi SİLİNMEZ."
    },
    pmSprintDeleteConfirm: { en: "Delete Sprint", tr: "Sprinti Sil" },
    pmSprintPaneTitle: { en: "Record details", tr: "Kayıt detayı" },
    pmSprintMicrotaskSearch: { en: "Search checklist", tr: "Checklist'te ara" },
    pmSprintMicrotaskSearchClear: { en: "Clear checklist search", tr: "Checklist aramasını temizle" },
    pmFieldGoal: { en: "Goal", tr: "Hedef" },
    docsCardsOpen: { en: "Open document", tr: "Dokümanı aç" },
    pmRecordViewList: { en: "List", tr: "Liste" },
    pmRecordViewSidePanel: { en: "Side panel", tr: "Yan panel" },
    pmSprintSidePanelShow: { en: "Show sprint side panel", tr: "Sprint yan panelini göster" },
    pmSprintSidePanelHide: { en: "Hide sprint side panel", tr: "Sprint yan panelini gizle" },
    pmSprintSidePanelClose: { en: "Close sprint side panel", tr: "Sprint yan panelini kapat" },
    pmRecordViewLabel: { en: "View", tr: "Görünüm" },
    pmRecordDelete: { en: "Delete record", tr: "Kaydı sil" },
    pmRecordDeleteTitle: { en: "Delete Record", tr: "Kaydı Sil" },
    pmRecordDeleteLabel: { en: "Record", tr: "Kayıt" },
    pmRecordDeleteQuestion: {
      en: "This permanently deletes the record. This cannot be undone.",
      tr: "Bu işlem kaydı kalıcı olarak siler ve geri alınamaz."
    },
    pmRecordDeleteWarn: {
      en: "Embedded content (e.g. review results) is deleted with the record; linked sprints/tasks are NOT deleted.",
      tr: "Gömülü içerik (örn. inceleme sonuçları) kayıtla birlikte silinir; bağlı sprint/görevler SİLİNMEZ."
    },
    pmRecordDeleteConfirm: { en: "Delete Record", tr: "Kaydı Sil" },
    pmRecordsAllStatuses: { en: "All statuses", tr: "Tüm durumlar" },
    pmReviewResults: { en: "Results", tr: "Sonuçlar" },
    pmReviewPositives: { en: "Positives", tr: "Olumlular" },
    pmReviewConcerns: { en: "Concerns", tr: "Endişeler" },
    pmReviewObjections: { en: "Objections", tr: "İtirazlar" },
    pmCardTasksWord: { en: "tasks", tr: "görev" },
    pmCardColumnsWord: { en: "columns", tr: "kolon" },
    pmCardStatsLabel: { en: "Column statistics", tr: "Kolon istatistikleri" },
    pmCardPaneTitle: { en: "Board details", tr: "Pano detayı" },
    pmCardPaneClose: { en: "Close details", tr: "Detayı kapat" },
    pmCardPaneColumns: { en: "Columns", tr: "Kolonlar" },
    pmCardPaneNoDescription: { en: "No description", tr: "Açıklama yok" },
    pmFieldCreated: { en: "Created", tr: "Oluşturulma" },
    pmNavSprintsGroup: { en: "Sprints", tr: "Sprintler" },
    pmNavPlansGroup: { en: "Plans", tr: "Planlar" },
    pmNavUntitled: { en: "Untitled", tr: "Adsız" },
    pmNavSearchSprints: { en: "Search sprints & plans", tr: "Sprint ve planlarda ara" },
    pmNavFilterSprints: { en: "Filter sprints and plans", tr: "Sprint ve planları filtrele" },
    pmNavSprintTools: { en: "Sprint navigator tools", tr: "Sprint navigatör araçları" },
    pmNavSprintsPane: { en: "Sprints navigator", tr: "Sprintler navigatörü" },
    pmNavNoSprints: { en: "No sprints or plans", tr: "Sprint veya plan yok" },
    pmNavNothingMatches: { en: "Nothing matches your search", tr: "Aramayla eşleşen kayıt yok" },
    pmNavSprintsPanelTitle: { en: "Sprints & Plans", tr: "Sprintler & Planlar" },
    pmNavSprintK: { en: "Sprint", tr: "Sprint" },
    pmNavSelect: { en: "Select", tr: "Seç" },
    projectsNavUnknownStatus: { en: "Unknown status", tr: "Durumu bilinmeyen" },
    projectsNavUntitled: { en: "Untitled project", tr: "Adsız proje" },
    projectsNavSearch: { en: "Search projects", tr: "Projelerde ara" },
    projectsNavFilter: { en: "Filter projects", tr: "Projeleri filtrele" },
    projectsNavTools: { en: "Project navigator tools", tr: "Proje navigatör araçları" },
    projectsNavPane: { en: "Projects navigator", tr: "Projeler navigatörü" },
    projectsNavEmpty: { en: "No projects", tr: "Proje yok" },
    projectsNavEmptySearch: { en: "No projects match your search", tr: "Aramayla eşleşen proje yok" },
    projectsNavAll: { en: "All projects", tr: "Tüm projeler" },
    projectsNavPanelTitle: { en: "Projects", tr: "Projeler" },
    projectsNavFavoritesRecentTitle: {
      en: "Favorites and Recent Projects",
      tr: "Favoriler ve Son Projeler"
    },
    projectsNavRecents: { en: "Recently opened projects", tr: "Son açılan projeler" },
    projectsNavRecentsEmpty: { en: "No recently opened projects", tr: "Son açılan proje yok" },
    projectsNavRecentsRemove: { en: "Remove from recent projects", tr: "Son projelerden kaldır" },
    navAgentspace: { en: "Agentspace", tr: "Agentspace" },
    asEyebrow: { en: "Agentspace", tr: "Agentspace" },
    asTitle: { en: "Agentspace Workbench", tr: "Agentspace Çalışma Alanı" },
    asHeaderNote: { en: "Project-scoped agent memory, missions and assets", tr: "Proje kapsamlı ajan hafızası, misyonlar ve varlıklar" },
    asSectionMemory: { en: "Memory", tr: "Hafıza" },
    asSectionMissions: { en: "Missions", tr: "Misyonlar" },
    asSectionDiscussions: { en: "Discussions", tr: "Tartışmalar" },
    asSectionPrompts: { en: "Prompts", tr: "Promptlar" },
    asSectionSkills: { en: "Skills", tr: "Skiller" },
    asSectionArtifacts: { en: "Artifacts", tr: "Artefaktlar" },
    asSectionResources: { en: "Resources", tr: "Kaynaklar" },
    asSectionAgents: { en: "Agents", tr: "Ajanlar" },
    asNoProjectTitle: { en: "Select a project", tr: "Bir proje seçin" },
    asNoProjectMessage: { en: "Agentspace reads are project-scoped — pick a project first.", tr: "Agentspace okumaları proje kapsamlıdır — önce bir proje seçin." },
    asLoadingTitle: { en: "Loading Agentspace", tr: "Agentspace yükleniyor" },
    asLoadingMessage: { en: "Fetching hosted agent records…", tr: "Barındırılan ajan kayıtları getiriliyor…" },
    asErrorTitle: { en: "Agentspace unavailable", tr: "Agentspace kullanılamıyor" },
    asEmptyTitle: { en: "No Agentspace records", tr: "Agentspace kaydı yok" },
    asEmptyMessage: { en: "No agent records for the selected project", tr: "Seçili proje için ajan kaydı yok" },
    asSearchMemory: { en: "Search memory", tr: "Hafızada ara" },
    asSearchMissions: { en: "Search missions", tr: "Misyonlarda ara" },
    asSearchDiscussions: { en: "Search discussions", tr: "Tartışmalarda ara" },
    asSearchPrompts: { en: "Search prompts", tr: "Promptlarda ara" },
    asSearchSkills: { en: "Search skills", tr: "Skillerde ara" },
    asSearchArtifacts: { en: "Search artifacts", tr: "Artefaktlarda ara" },
    asSearchResources: { en: "Search resources", tr: "Kaynaklarda ara" },
    asSearchAgents: { en: "Search agents", tr: "Ajanlarda ara" },
    asNoRecords: { en: "No records", tr: "Kayıt yok" },
    asFieldKind: { en: "Kind", tr: "Tür" },
    asFieldDurability: { en: "Durability", tr: "Kalıcılık" },
    asFieldImportance: { en: "Importance", tr: "Önem" },
    asFieldSource: { en: "Source", tr: "Kaynak" },
    asFieldSlug: { en: "Slug", tr: "Slug" },
    asFieldObjective: { en: "Objective", tr: "Hedef" },
    asFieldTaskDefinition: { en: "Task definition", tr: "Görev tanımı" },
    asFieldActivePlan: { en: "Active plan", tr: "Aktif plan" },
    asFieldParticipants: { en: "Participants", tr: "Katılımcılar" },
    asFieldLastTurn: { en: "Last turn", tr: "Son tur" },
    asFieldLastSeq: { en: "Last seq", tr: "Son sıra" },
    asFieldRules: { en: "Rules", tr: "Kurallar" },
    asFieldBlockedOn: { en: "Blocked on", tr: "Bloklayan" },
    asAttentionBlocked: { en: "Attention", tr: "Dikkat" },
    asFieldReplyTo: { en: "Reply to", tr: "Yanıt" },
    asFieldAddressedTo: { en: "Addressed to", tr: "Adreslenen" },
    asFieldOutputOwner: { en: "Owner", tr: "Sahip" },
    asFieldQuestion: { en: "Question", tr: "Soru" },
    asFieldDescription: { en: "Description", tr: "Açıklama" },
    asFieldCurrentVersion: { en: "Current version", tr: "Güncel versiyon" },
    asFieldResourceType: { en: "Resource type", tr: "Kaynak türü" },
    asFieldRef: { en: "Reference", tr: "Referans" },
    asFieldUri: { en: "URI", tr: "URI" },
    asArtifactsGapTitle: { en: "Artifacts unavailable", tr: "Artefaktlar kullanılamıyor" },
    asArtifactsGapMessage: { en: "The hosted artifacts read failed (backend gap, tracked as a PM issue)", tr: "Barındırılan artefakt okuması başarısız (backend eksiği, PM issue olarak izleniyor)" },
    asFieldArtifactType: { en: "Artifact type", tr: "Artefakt türü" },
    asFieldMimeType: { en: "MIME type", tr: "MIME türü" },
    asFieldSize: { en: "Size", tr: "Boyut" },
    asFieldStoragePath: { en: "Storage path", tr: "Depolama yolu" },
    asFieldRole: { en: "Role", tr: "Rol" },
    asFieldCapabilities: { en: "Capabilities", tr: "Yetkinlikler" },
    asFieldUpdated: { en: "Updated", tr: "Güncelleme" },
    asFilterAll: { en: "All", tr: "Tümü" },
    asMemoryViewLabel: { en: "View", tr: "Görünüm" },
    asMemoryViewTimeline: { en: "Timeline", tr: "Zaman çizgisi" },
    asMemoryViewCards: { en: "Cards", tr: "Kartlar" },
    asMemoryViewRead: { en: "Read", tr: "Oku" },
    asMemoryViewDigest: { en: "Digest", tr: "Özet" },
    asMemoryMap: { en: "Memory map", tr: "Hafıza haritası" },
    asMemoryBlocks: { en: "blocks", tr: "blok" },
    asMemoryTimeline: { en: "Timeline", tr: "Zaman çizgisi" },
    asMemoryNewestFirst: { en: "newest first", tr: "en yeni önce" },
    asMemoryAllKinds: { en: "All kinds", tr: "Tüm türler" },
    asMemoryDaysShown: { en: "days shown", tr: "gün gösteriliyor" },
    asMemoryBlock: { en: "block", tr: "blok" },
    asMemoryNeighbors: { en: "Neighbors", tr: "Komşular" },
    asMemoryOlder: { en: "older", tr: "eski" },
    asMemoryNewer: { en: "newer", tr: "yeni" },
    asMemorySortBy: { en: "Sort by", tr: "Sırala" },
    asMemorySortUpdated: { en: "Updated ↓", tr: "Güncelleme ↓" },
    asMemorySortCreated: { en: "Created ↓", tr: "Oluşturma ↓" },
    asMemorySortKind: { en: "Kind", tr: "Tür" },
    asMemorySortImportance: { en: "Importance ↓", tr: "Önem ↓" },
    asMemoryCreated: { en: "Created", tr: "Oluşturma" },
    asMemoryContent: { en: "Content", tr: "İçerik" },
    asMemoryTags: { en: "Tags", tr: "Etiketler" },
    asMemoryScope: { en: "Scope", tr: "Kapsam" },
    asMemoryByKind: { en: "by kind", tr: "türe göre" },
    asMemoryLatest: { en: "latest", tr: "son" },
    asMemoryShowMore: { en: "Show", tr: "Göster" },
    asOpenDigestPane: { en: "Open", tr: "Aç" },
    asCloseDigestPane: { en: "Close", tr: "Kapat" },
    asPageLoadMore: { en: "Load more", tr: "Daha fazla yükle" },
    asFieldRoles: { en: "Roles", tr: "Roller" },
    asFieldSuccessCriteria: { en: "Success criteria", tr: "Başarı ölçütleri" },
    asFieldConstraints: { en: "Constraints", tr: "Kısıtlar" },
    asOpenPlanInPm: { en: "Open plan in PM ▸ Sprints", tr: "Planı PM ▸ Sprintler'de aç" },
    asTurns: { en: "Turns", tr: "Turlar" },
    asNoTurns: { en: "No turns yet", tr: "Henüz tur yok" },
    asOutputs: { en: "Conclusion outputs", tr: "Sonuç çıktıları" },
    asOutputKindDecision: { en: "Decision", tr: "Karar" },
    asOutputKindConsensus: { en: "Consensus", tr: "Uzlaşı" },
    asOutputKindDisagreement: { en: "Disagreement", tr: "Ayrışma" },
    asOutputKindOpenQuestions: { en: "Open questions", tr: "Açık sorular" },
    asOutputKindFinalStance: { en: "Final stance", tr: "Son duruş" },
    asDiscussionTurnOrder: { en: "Turn order", tr: "Tur sırası" },
    asDiscussionMinTurns: { en: "Min turns", tr: "En az tur" },
    asDiscussionRequireQuestionAnswer: { en: "Requires question answer", tr: "Soru yanıtı gerekir" },
    asVersionBody: { en: "Current version content", tr: "Güncel versiyon içeriği" },
    navDocs: { en: "Docs", tr: "Dokümanlar" },
    docsEyebrow: { en: "Docman", tr: "Docman" },
    docsTitle: { en: "Documents", tr: "Dokümanlar" },
    docsHeaderNote: { en: "Hosted Docman document graph (read-only)", tr: "Barındırılan Docman doküman grafiği (salt okunur)" },
    docsLoadingTitle: { en: "Loading documents", tr: "Dokümanlar yükleniyor" },
    docsErrorTitle: { en: "Docman unavailable", tr: "Docman kullanılamıyor" },
    docsEmptyTitle: { en: "No documents", tr: "Doküman yok" },
    docsEmptyMessage: { en: "No Docman documents for the selected project", tr: "Seçili proje için Docman dokümanı yok" },
    docsNoContent: { en: "This version has no assembled content yet.", tr: "Bu versiyonun henüz birleştirilmiş içeriği yok." },
    docsNavPanelTitle: { en: "Documents", tr: "Dokümanlar" },
    docsNavPane: { en: "Documents navigator", tr: "Dokümanlar navigatörü" },
    docsNavTools: { en: "Document navigator tools", tr: "Doküman navigatör araçları" },
    docsNavSearch: { en: "Search documents", tr: "Dokümanlarda ara" },
    docsNavFilter: { en: "Filter documents", tr: "Dokümanları filtrele" },
    docsNavEmpty: { en: "No documents", tr: "Doküman yok" },
    docsNavEmptySearch: { en: "No documents match your search", tr: "Aramayla eşleşen doküman yok" },
    docsNavUntitled: { en: "Untitled document", tr: "Adsız doküman" },
    docsNavUngrouped: { en: "Ungrouped", tr: "Grupsuz" },
    docsNavDocK: { en: "Document", tr: "Doküman" },
    docsNavSelectDoc: { en: "Select document", tr: "Doküman seç" },
    docsOutline: { en: "Contents", tr: "İçindekiler" },
    docsVersions: { en: "Versions", tr: "Versiyonlar" },
    pmGroupNone: { en: "None", tr: "Yok" },
    pmGroupColumn: { en: "Column", tr: "Kolon" },
    pmGroupSprint: { en: "Sprint", tr: "Sprint" },
    pmNoSprint: { en: "No sprint", tr: "Sprint yok" },
    pmPhasesTab: { en: "Phases", tr: "Fazlar" },
    pmReferencesTab: { en: "References", tr: "Referanslar" },
    pmTasksTab: { en: "Tasks", tr: "Görevler" },
    pmPhaseView: { en: "Phase view", tr: "Faz görünümü" },
    pmPhaseTimeline: { en: "Timeline", tr: "Zaman akışı" },
    pmPhaseAccordion: { en: "Accordion", tr: "Akordeon" },
    pmPhaseTable: { en: "Table", tr: "Tablo" },
    pmTimelineEyebrow: { en: "Execution map", tr: "Yürütme haritası" },
    pmTimelineTitle: { en: "Plan timeline", tr: "Plan akışı" },
    pmTimelineSubtitle: {
      en: "Follow completed work, the active boundary and what comes next.",
      tr: "Tamamlanan işleri, aktif sınırı ve sırada ne olduğunu tek akışta izle."
    },
    pmTimelineProgress: { en: "Plan progress", tr: "Plan ilerlemesi" },
    pmTimelineCurrent: { en: "Current phase", tr: "Aktif faz" },
    pmTimelineNext: { en: "Up next", tr: "Sıradaki" },
    pmTimelineComplete: { en: "Complete", tr: "Tamamlandı" },
    pmTimelineUpcoming: { en: "Upcoming", tr: "Sırada" },
    pmTimelineBlocked: { en: "Blocked", tr: "Engelli" },
    pmTimelineUnplanned: { en: "No checklist", tr: "Checklist yok" },
    pmTimelineFinished: { en: "All phases complete", tr: "Tüm fazlar tamamlandı" },
    pmTimelineFinishLine: { en: "Finish line", tr: "Bitiş çizgisi" },
    pmTimelineCompletedTasks: { en: "tasks complete", tr: "iş tamamlandı" },
    pmTimelineCompletedPhases: { en: "phases complete", tr: "faz tamamlandı" },
    pmTimelinePhase: { en: "Phase", tr: "Faz" },
    pmTimelineTasks: { en: "items", tr: "iş" },
    pmTimelineNoTasks: {
      en: "This phase has no checklist items yet.",
      tr: "Bu faz için henüz checklist maddesi yok."
    },
    pmPhaseChecklistItem: { en: "Checklist item", tr: "Kontrol öğesi" },
    pmPhaseNotes: { en: "Notes", tr: "Notlar" },
    pmSeverity: { en: "Severity", tr: "Önem" },
    pmSource: { en: "Source", tr: "Kaynak" },
    pmType: { en: "Type", tr: "Tür" },
    pmPriority: { en: "Priority", tr: "Öncelik" },
    pmScope: { en: "Scope", tr: "Kapsam" },
    pmDescription: { en: "Description", tr: "Açıklama" },
    pmInstructions: { en: "Instructions", tr: "Yönergeler" },
    pmSearchIssues: { en: "Search issues", tr: "Sorunlarda ara" },
    pmSearchFeedback: { en: "Search feedback", tr: "Geri bildirimde ara" },
    pmSearchReviews: { en: "Search reviews", tr: "İncelemelerde ara" },
    pmNoIssues: { en: "No issues", tr: "Sorun yok" },
    pmNoFeedback: { en: "No feedback", tr: "Geri bildirim yok" },
    pmNoReviews: { en: "No review requests", tr: "İnceleme isteği yok" },
    pmOverviewTitle: { en: "PM Overview", tr: "PM Özeti" },
    pmTasksTitle: { en: "Tasks", tr: "Görevler" },
    pmBoardsTitle: { en: "Boards", tr: "Panolar" },
    pmSprintsPlansTitle: { en: "Sprints and Plans", tr: "Sprintler ve Planlar" },
    pmContextTitle: { en: "PM Context", tr: "PM Bağlamı" },
    pmBoards: { en: "Boards", tr: "Panolar" },
    pmTasks: { en: "Tasks", tr: "Görevler" },
    pmSprints: { en: "Sprints", tr: "Sprintler" },
    pmPlans: { en: "Plans", tr: "Planlar" },
    pmIssues: { en: "Issues", tr: "Sorunlar" },
    pmFeedback: { en: "Feedback", tr: "Geri bildirim" },
    pmReviews: { en: "Reviews", tr: "İncelemeler" },
    pmOpenItems: { en: "Open items", tr: "Açık kayıtlar" },
    pmRequestedReviews: { en: "Requested reviews", tr: "Bekleyen incelemeler" },
    pmLatestTasks: { en: "Active tasks", tr: "Aktif görevler" },
    pmReviewQueue: { en: "Review queue", tr: "İnceleme kuyruğu" },
    pmIssueQueue: { en: "Issue queue", tr: "Sorun kuyruğu" },
    pmNoRows: { en: "No records", tr: "Kayıt yok" },
    pmArchiveFilter: { en: "Archive visibility", tr: "Arşiv görünürlüğü" },
    pmFilterActive: { en: "Active", tr: "Aktif" },
    pmFilterArchived: { en: "Archived", tr: "Arşiv" },
    pmBoardSelect: { en: "Board selector", tr: "Pano seçici" },
    pmBoardViewMode: { en: "Board view mode", tr: "Pano görünüm modu" },
    pmBoardModeKanban: { en: "Kanban", tr: "Kanban" },
    pmBoardModeTable: { en: "Table", tr: "Tablo" },
    pmBoardSummary: { en: "Board summary", tr: "Pano özeti" },
    pmCompleted: { en: "Completed", tr: "Tamamlanan" },
    pmNoArchivedBoards: { en: "No archived boards", tr: "Arşivlenmiş pano yok" },
    pmPlanTypeFilter: { en: "Sprint or plan filter", tr: "Sprint veya plan filtresi" },
    pmFilterAllPlanTypes: { en: "All types", tr: "Tüm tipler" },
    pmSprintType: { en: "Sprint", tr: "Sprint" },
    pmPlanType: { en: "Plan", tr: "Plan" },
    pmPlanDetailTitle: { en: "Sprint or plan detail", tr: "Sprint veya plan detayı" },
    pmLoadingDetail: { en: "Loading detail", tr: "Detay yükleniyor" },
    pmPlanNoGoal: { en: "No goal", tr: "Hedef yok" },
    pmFieldLinkedTask: { en: "Linked task", tr: "Bağlı görev" },
    pmScopeTitle: { en: "Scope", tr: "Kapsam" },
    pmValidationTitle: { en: "Validation", tr: "Doğrulama" },
    pmNoArchivedPlans: { en: "No archived sprints or plans", tr: "Arşivlenmiş sprint veya plan yok" },
    pmPhasesEmpty: { en: "No phases", tr: "Faz yok" },
    pmTaskBoardFilter: { en: "Board filter", tr: "Pano filtresi" },
    pmTaskSprintFilter: { en: "Sprint filter", tr: "Sprint filtresi" },
    pmFilterAllBoards: { en: "All boards", tr: "Tüm panolar" },
    pmFilterAllSprints: { en: "All sprints", tr: "Tüm sprintler" },
    pmCountVisible: { en: "Visible", tr: "Görünen" },
    pmTaskDetailTitle: { en: "Task detail", tr: "Görev detayı" },
    pmTaskDrilldownBack: { en: "Back to board", tr: "Panoya dön" },
    pmTaskNoDescription: { en: "No description", tr: "Açıklama yok" },
    pmFieldId: { en: "ID", tr: "ID" },
    pmFieldBoard: { en: "Board", tr: "Pano" },
    pmFieldColumn: { en: "Column", tr: "Kolon" },
    pmFieldSprint: { en: "Sprint", tr: "Sprint" },
    pmFieldProgress: { en: "Progress", tr: "İlerleme" },
    pmFieldStatus: { en: "Status", tr: "Durum" },
    pmUnassigned: { en: "Unassigned", tr: "Atanmamış" },
    pmUnknownStatus: { en: "Unknown", tr: "Bilinmiyor" },
    contentCopy: { en: "Copy content", tr: "İçeriği kopyala" },
    contentCopied: { en: "Content copied", tr: "İçerik kopyalandı" },
    contentCopyFailed: { en: "Content could not be copied", tr: "İçerik kopyalanamadı" },
    themeLight: { en: "Light", tr: "Açık" },
    themeDark: { en: "Dark", tr: "Koyu" },
    a11ySectionSwitch: { en: "Section switch", tr: "Bölüm değiştirici" },
    a11yLocaleSwitch: { en: "Language switch", tr: "Dil değiştirici" },
    a11yNavToggle: { en: "Toggle navigation", tr: "Navigasyonu aç/kapat" },
    navCollapse: { en: "Collapse to icon rail", tr: "Simge rayına daralt" },
    navExpand: { en: "Expand sidebar", tr: "Kenar çubuğunu genişlet" },
    navHide: { en: "Hide sidebar", tr: "Kenar çubuğunu gizle" },
    navHideHint: { en: "Reopen from the menu button in the top bar", tr: "Üst çubuktaki menü düğmesinden yeniden aç" },
    navHeaderControls: { en: "Sidebar size controls", tr: "Kenar çubuğu boyut denetimleri" },
    navReopen: { en: "Open navigation menu", tr: "Navigasyon menüsünü aç" },
    navPin: { en: "Pin sidebar", tr: "Menüyü sabitle" },
    navUnpin: { en: "Unpin sidebar (reveal on hover)", tr: "Sabitlemeyi kaldır (üzerine gelince aç)" },
    statusReady: { en: "READY", tr: "HAZIR" },
    brandTitle: { en: "aopslab", tr: "aopslab" },
    brandSubtitle: { en: "OPERATOR COCKPIT", tr: "OPERATÖR KOKPİT" },
    authChecking: { en: "Checking", tr: "Kontrol ediliyor" },
    authStatusActive: { en: "Signed in", tr: "Oturum açık" },
    statusApi: { en: "API", tr: "API" },
    statusProject: { en: "Project", tr: "Proje" },
    statusNoProject: { en: "No project", tr: "Proje yok" },
    themeStudioTitle: { en: "Theme Studio", tr: "Tema Stüdyosu" },
    themeStudioSubtitle: { en: "Pick or craft a theme", tr: "Tema seç veya oluştur" },
    themeStudioClose: { en: "Close", tr: "Kapat" },
    themeStudioBuiltin: { en: "Built-in", tr: "Yerleşik" },
    themeStudioCustom: { en: "Custom", tr: "Özel" },
    themeStudioUse: { en: "Use", tr: "Kullan" },
    themeStudioActive: { en: "Active", tr: "Aktif" },
    themeStudioNew: { en: "New theme", tr: "Yeni tema" },
    themeStudioCopy: { en: "Copy", tr: "Kopyala" },
    themeStudioEdit: { en: "Edit", tr: "Düzenle" },
    themeStudioDelete: { en: "Delete", tr: "Sil" },
    themeStudioMode: { en: "Mode", tr: "Mod" },
    themeStudioAccent: { en: "Accent", tr: "Vurgu" },
    themeStudioName: { en: "Theme name", tr: "Tema adı" },
    themeStudioLightColors: { en: "Light colors", tr: "Açık renkler" },
    themeStudioDarkColors: { en: "Dark colors", tr: "Koyu renkler" },
    themeStudioColorCanvas: { en: "Canvas", tr: "Zemin" },
    themeStudioColorSurface: { en: "Surface", tr: "Yüzey" },
    themeStudioColorText: { en: "Text", tr: "Metin" },
    themeStudioVariants: { en: "Accents", tr: "Vurgular" },
    themeStudioVariantSecondary: { en: "Secondary", tr: "İkincil" },
    themeStudioVariantTertiary: { en: "Tertiary", tr: "Üçüncül" },
    themeStudioVariantLabel: { en: "Label", tr: "Etiket" },
    themeStudioAddVariant: { en: "Add accent", tr: "Vurgu ekle" },
    themeStudioRemoveVariant: { en: "Remove", tr: "Kaldır" },
    themeStudioReadonlyNote: { en: "Built-in themes can be copied, not edited", tr: "Yerleşik temalar kopyalanır, düzenlenmez" },
    themeStudioDone: { en: "Done", tr: "Tamam" },
    chatEyebrow: { en: "Sessions", tr: "Oturumlar" },
    chatTitle: { en: "Chat", tr: "Sohbet" },
    chatHeaderNote: { en: "Hosted ChatV3 rooms", tr: "Hosted ChatV3 odaları" },
    chatStatusIdle: { en: "Idle", tr: "Boşta" },
    chatStatusConnecting: { en: "Connecting", tr: "Bağlanıyor" },
    chatStatusConnected: { en: "Connected", tr: "Bağlı" },
    chatStatusError: { en: "Error", tr: "Hata" },
    chatConnectTitle: { en: "No channel joined", tr: "Katılınan kanal yok" },
    chatConnectMessage: {
      en: "Pick a channel and room from the navigator to start chatting.",
      tr: "Sohbete başlamak için navigatörden bir kanal ve oda seçin."
    },
    chatChannelLockedTitle: { en: "Channel locked on this browser", tr: "Kanal bu tarayıcıda kilitli" },
    chatChannelLockedMessage: {
      en: "Your account can see this channel, but no recovery package is available for this browser yet. Paste an invite once to unlock it.",
      tr: "Hesabınız bu kanalı görüyor, ancak bu tarayıcı için henüz kurtarma paketi yok. Kilidi açmak için daveti bir kez yapıştırın."
    },
    chatChannelPinLockedTitle: { en: "Chat PIN required", tr: "Sohbet PIN'i gerekli" },
    chatChannelPinLockedMessage: {
      en: "This channel is recoverable, but the local account key is locked. Enter the Chat PIN or paste an invite from a current device.",
      tr: "Bu kanal kurtarılabilir, ancak yerel hesap anahtarı kilitli. Sohbet PIN'ini girin veya güncel bir cihazdan davet yapıştırın."
    },
    chatChannelStaleTitle: { en: "Current device required", tr: "Güncel cihaz gerekli" },
    chatChannelStaleMessage: {
      en: "The recovery package is stale after a key rotation. Open the channel on a current unlocked device so it can publish a fresh package.",
      tr: "Anahtar rotasyonundan sonra kurtarma paketi bayatlamış. Taze paket yayınlamak için kanalı güncel ve açık bir cihazda açın."
    },
    chatChannelRecoverableTitle: { en: "Recovering channel", tr: "Kanal kurtarılıyor" },
    chatChannelRecoverableMessage: {
      en: "This browser is using your account-bound key package to restore the channel. If it stays locked, refresh or paste an invite.",
      tr: "Bu tarayıcı kanalı geri yüklemek için hesaba bağlı anahtar paketini kullanıyor. Kilitli kalırsa yenileyin veya davet yapıştırın."
    },
    chatRecoveryErrorLabel: { en: "Recovery diagnostic:", tr: "Kurtarma tanısı:" },
    chatRecoveryPinLabel: { en: "Chat PIN", tr: "Sohbet PIN'i" },
    chatRecoveryPinRequired: { en: "PIN is required", tr: "PIN gerekli" },
    chatUnlockWithPin: { en: "Unlock with PIN", tr: "PIN ile aç" },
    chatPasteInvite: { en: "Paste invite", tr: "Davet yapıştır" },
    chatNoRoomTitle: { en: "No room selected", tr: "Oda seçili değil" },
    chatNoRoomMessage: {
      en: "Select a room to load its messages.",
      tr: "Mesajları yüklemek için bir oda seçin."
    },
    chatSpacesTitle: { en: "Spaces", tr: "Alanlar" },
    chatSpacesBandLabel: { en: "Space", tr: "Alan" },
    chatSpacesBandScope: { en: "Chat spaces", tr: "Sohbet alanları" },
    chatSpacesLoading: { en: "Loading spaces", tr: "Alanlar yükleniyor" },
    chatSpacesEmpty: { en: "No spaces", tr: "Alan yok" },
    chatSpacesUnavailable: { en: "Space directory unavailable", tr: "Alan dizini kullanılamıyor" },
    chatSpacesManage: { en: "Manage spaces...", tr: "Alan yönet..." },
    chatSpacesManageTitle: { en: "Manage spaces", tr: "Alan yönetimi" },
    chatSpacesManageIntro: {
      en: "Create spaces and archive unused active spaces from this channel scope.",
      tr: "Bu kanal kapsamında alan oluşturun ve kullanılmayan aktif alanları arşivleyin."
    },
    chatSpacesReadOnlyNote: {
      en: "You do not have ChatV3 space admin permission, so this modal is read-only.",
      tr: "ChatV3 alan yönetimi yetkiniz yok; bu modal salt okunur."
    },
    chatSpacesRenameUnsupported: {
      en: "Rename is not supported.",
      tr: "Yeniden adlandırma desteklenmiyor."
    },
    chatSpaceCreateTitle: { en: "New space", tr: "Yeni alan" },
    chatSpaceTitleLabel: { en: "Space title", tr: "Alan adı" },
    chatSpaceTitlePlaceholder: { en: "Field Operations", tr: "Saha Operasyonları" },
    chatSpaceSlugPreview: { en: "Slug", tr: "Slug" },
    chatSpaceCreate: { en: "Create space", tr: "Alan oluştur" },
    chatSpaceCreating: { en: "Creating", tr: "Oluşturuluyor" },
    chatSpaceArchive: { en: "Archive", tr: "Arşivle" },
    chatSpaceArchiving: { en: "Archiving", tr: "Arşivleniyor" },
    chatSpaceDefaultArchiveDisabled: {
      en: "Default space cannot be archived.",
      tr: "Varsayılan alan arşivlenemez."
    },
    chatSpaceArchiveMissingId: {
      en: "Refresh the admin space list before archiving this space.",
      tr: "Bu alanı arşivlemeden önce admin alan listesini yenileyin."
    },
    chatSpaceListEmpty: { en: "No spaces yet.", tr: "Henüz alan yok." },
    chatChannelsLabel: { en: "Channels", tr: "Kanallar" },
    chatRoomsLabel: { en: "Rooms", tr: "Odalar" },
    chatActiveRoom: { en: "Active room", tr: "Aktif oda" },
    chatMessageCount: { en: "Messages", tr: "Mesajlar" },
    chatRefresh: { en: "Refresh", tr: "Yenile" },
    chatSearchPlaceholder: { en: "Search channels and rooms", tr: "Kanal ve oda ara" },
    chatNoChannelsNav: { en: "No channels", tr: "Kanal yok" },
    chatNoChannelsSearch: { en: "No channels or rooms match", tr: "Eşleşen kanal veya oda yok" },
    chatNewChannel: { en: "New channel", tr: "Yeni kanal" },
    chatJoinChannel: { en: "Join channel", tr: "Kanala katıl" },
    chatCreateTab: { en: "Create", tr: "Oluştur" },
    chatJoinTab: { en: "Join", tr: "Katıl" },
    chatHandle: { en: "Handle", tr: "Takma ad" },
    chatChannelName: { en: "Channel name", tr: "Kanal adı" },
    chatChannelNamePh: { en: "sprint-coordination", tr: "sprint-koordinasyon" },
    chatEncryptionMode: { en: "Encryption mode", tr: "Şifreleme modu" },
    chatEncryptionServer: { en: "Server-encrypted (default)", tr: "Sunucu şifrelemeli (varsayılan)" },
    chatEncryptionServerHint: {
      en: "Easier cross-device access. Data is encrypted at rest, but the server can access message content while serving the room.",
      tr: "Cihazlar arası erişim daha kolaydır. Veri saklanırken şifrelidir, ancak oda sunulurken sunucu mesaj içeriğine erişebilir."
    },
    chatEncryptionE2e: { en: "End-to-end", tr: "Uçtan uca" },
    chatEncryptionE2eShort: { en: "E2E", tr: "E2E" },
    chatEncryptionE2eHint: {
      en: "The server cannot recover content. Each browser needs an invite or recovery package before it can open the channel.",
      tr: "Sunucu içeriği kurtaramaz. Her tarayıcı kanalı açmadan önce davet veya kurtarma paketine ihtiyaç duyar."
    },
    chatChannelRules: { en: "Channel rules (optional)", tr: "Kanal kuralları (isteğe bağlı)" },
    chatChannelRulesPh: { en: "Markdown guidance for this channel", tr: "Bu kanal için markdown rehber" },
    chatInvite: { en: "Invite", tr: "Davet" },
    chatInvitePh: { en: "chv3://join/...", tr: "chv3://join/..." },
    chatCreate: { en: "Create channel", tr: "Kanal oluştur" },
    chatJoin: { en: "Join channel", tr: "Kanala katıl" },
    chatCancel: { en: "Cancel", tr: "Vazgeç" },
    chatConnectPanelTitle: { en: "Add a channel", tr: "Kanal ekle" },
    chatEmpty: { en: "No messages yet", tr: "Henüz mesaj yok" },
    chatDayToday: { en: "Today", tr: "Bugün" },
    chatDayYesterday: { en: "Yesterday", tr: "Dün" },
    chatUnreadDivider: { en: "New", tr: "Yeni" },
    chatRead: { en: "Read", tr: "Okundu" },
    chatDelivered: { en: "Delivered", tr: "İletildi" },
    chatCopied: { en: "Copied", tr: "Kopyalandı" },
    chatCopyRef: { en: "Copy message ref", tr: "Mesaj referansını kopyala" },
    chatAckShort: { en: "ACK", tr: "ACK" },
    chatAcknowledge: { en: "Acknowledge", tr: "Onayla" },
    chatAcknowledged: { en: "Acknowledged", tr: "Onaylandı" },
    chatYou: { en: "you", tr: "sen" },
    chatLockedHint: { en: "locked (no key)", tr: "kilitli (anahtar yok)" },
    chatLockedNeedsPinHint: { en: "PIN required", tr: "PIN gerekli" },
    chatLockedRecoverableHint: { en: "recoverable", tr: "kurtarılabilir" },
    chatLockedStaleHint: { en: "stale package", tr: "bayat paket" },
    chatComposerPlaceholder: { en: "type a message - / to set kind", tr: "mesaj yaz - / ile tür seç" },
    chatComposerSend: { en: "Send", tr: "Gönder" },
    chatComposerEnc: { en: "Encrypted channel", tr: "Şifreli kanal" },
    chatComposerKindLabel: { en: "Message kind", tr: "Mesaj türü" },
    chatKindMessage: { en: "Message", tr: "Mesaj" },
    chatKindDirective: { en: "Directive", tr: "Direktif" },
    chatKindQuestion: { en: "Question", tr: "Soru" },
    chatKindDecision: { en: "Decision", tr: "Karar" },
    chatKindStatus: { en: "Status", tr: "Durum" },
    chatRulesOpen: { en: "Rules", tr: "Kurallar" },
    chatRulesTitle: { en: "Channel & room rules", tr: "Kanal ve oda kuralları" },
    chatRulesChannel: { en: "Channel rules", tr: "Kanal kuralları" },
    chatRulesRoom: { en: "Room rules", tr: "Oda kuralları" },
    chatRulesEmpty: { en: "No rules set", tr: "Kural tanımlı değil" },
    chatClose: { en: "Close", tr: "Kapat" },
    chatRefsTitle: { en: "References", tr: "Referanslar" },
    chatRefsEmpty: { en: "No references", tr: "Referans yok" },
    chatRefsCopy: { en: "Copy reference", tr: "Referansı kopyala" },
    chatRefsToggle: { en: "References", tr: "Referanslar" },
    chatNewRoom: { en: "New room", tr: "Yeni oda" },
    chatRoomName: { en: "Room name", tr: "Oda adı" },
    chatRoomNamePh: { en: "design-review", tr: "tasarım-inceleme" },
    chatRoomRules: { en: "Room rules (optional)", tr: "Oda kuralları (isteğe bağlı)" },
    chatCreateRoom: { en: "Create room", tr: "Oda oluştur" },
    chatActions: { en: "Actions", tr: "İşlemler" },
    chatArchiveRoom: { en: "Archive room", tr: "Odayı arşivle" },
    chatDeleteRoom: { en: "Delete room…", tr: "Odayı sil…" },
    chatArchiveChannel: { en: "Archive channel", tr: "Kanalı arşivle" },
    chatUnarchiveChannel: { en: "Unarchive channel", tr: "Kanalı geri al" },
    chatDeleteChannel: { en: "Delete channel…", tr: "Kanalı sil…" },
    chatLeaveChannel: { en: "Leave channel", tr: "Kanaldan ayrıl" },
    chatDeleteConfirmTitle: { en: "Confirm delete", tr: "Silmeyi onayla" },
    chatDeleteConfirmMessage: {
      en: "This permanently deletes it. Type the slug to confirm:",
      tr: "Bu kalıcı olarak siler. Onaylamak için slug yazın:"
    },
    chatDeleteConfirmSlugLabel: { en: "Slug", tr: "Slug" },
    chatDelete: { en: "Delete", tr: "Sil" },
    chatArchivedBadge: { en: "Archived", tr: "Arşivli" },
    chatRenameUnsupported: {
      en: "Rename is not supported by hosted ChatV3 (titles are immutable; use archive or delete).",
      tr: "Yeniden adlandırma hosted ChatV3'te desteklenmez (başlıklar değiştirilemez; arşivle veya sil)."
    },
    chatChannelSection: { en: "Channel", tr: "Kanal" },
    chatRoomSection: { en: "Room", tr: "Oda" },
    chatNavSettings: { en: "View settings", tr: "Görünüm ayarları" },
    chatNavMode: { en: "Mode", tr: "Mod" },
    chatNavModeNavigator: { en: "Navigator", tr: "Navigatör" },
    chatNavModeLeftMenu: { en: "Left menu", tr: "Sol menü" },
    chatNavReopen: { en: "Show navigator", tr: "Navigatörü göster" },
    chatBackToChannels: { en: "Back to channels", tr: "Kanallara dön" },
    chatNavPanelTitle: { en: "Channels", tr: "Kanallar" },
    chatRecordEyebrow: { en: "Chat room", tr: "Sohbet odası" },
    chatEpochShort: { en: "Epoch", tr: "Epoch" },
    chatTabMessages: { en: "Messages", tr: "Mesajlar" },
    chatTabMembers: { en: "Members", tr: "Üyeler" },
    chatTabReferences: { en: "References", tr: "Referanslar" },
    chatTabRules: { en: "Rules", tr: "Kurallar" },
    chatTabActivity: { en: "Activity", tr: "Aktivite" },
    chatPresenceOnline: { en: "online", tr: "çevrimiçi" },
    chatMembersOnline: { en: "members online", tr: "üye çevrimiçi" },
    chatMemberRailExpand: { en: "Expand members", tr: "Üyeleri genişlet" },
    chatMemberRailCollapse: { en: "Collapse members", tr: "Üyeleri daralt" },
    chatMembersEmpty: { en: "No members", tr: "Üye yok" },
    chatMemberRemove: { en: "Remove", tr: "Çıkar" },
    chatMemberRemoveConfirm: {
      en: "Remove this member from the channel?",
      tr: "Bu üye kanaldan çıkarılsın mı?"
    },
    chatMemberYou: { en: "you", tr: "sen" },
    chatMemberRemoved: { en: "removed", tr: "çıkarıldı" },
    chatMemberReadUpTo: { en: "read up to", tr: "okudu" },
    chatMemberDeliveredUpTo: { en: "delivered up to", tr: "iletildi" },
    chatPresenceActive: { en: "active", tr: "aktif" },
    chatPresenceIdle: { en: "idle", tr: "boşta" },
    chatPresenceOffline: { en: "offline", tr: "çevrimdışı" },
    chatInviteHint: {
      en: "Share this invite with another browser, user, or agent to join the same encrypted channel.",
      tr: "Aynı şifreli kanala katılması için bu daveti başka bir tarayıcı, kullanıcı veya agent ile paylaş."
    },
    chatInviteAction: { en: "Invite", tr: "Davet et" },
    chatInviteUnavailable: { en: "No stored invite for this channel", tr: "Bu kanal için kayıtlı davet yok" },
    chatCopyInvite: { en: "Copy invite", tr: "Daveti kopyala" },
    chatInviteCopied: { en: "Invite copied", tr: "Davet kopyalandı" },
    chatActivityDirective: { en: "Latest directive", tr: "Son direktif" },
    chatActivityNoDirective: { en: "No directive yet", tr: "Henüz direktif yok" },
    chatActivityAcked: { en: "acknowledged", tr: "onaylandı" },
    chatActivityEpoch: { en: "Encryption epoch", tr: "Şifreleme epoch" },
    chatActivityPresenceTitle: { en: "Presence", tr: "Durum" },
    chatActivityRoomMeta: { en: "Room", tr: "Oda" },
    chatActivityAcknowledged: { en: "You acknowledged", tr: "Onayladın" },
    chatActivityPending: { en: "Pending your ack", tr: "Onayın bekleniyor" },
    debugTitle: { en: "Live API Activity", tr: "Canlı API Aktivitesi" },
    debugEyebrow: { en: "Status + Logs", tr: "Durum + Loglar" },
    debugClear: { en: "Clear", tr: "Temizle" },
    debugClose: { en: "Close", tr: "Kapat" },
    debugLogs: { en: "Logs", tr: "Loglar" },
    debugIssues: { en: "Issues", tr: "Sorunlar" },
    debugFilterAll: { en: "All", tr: "Hepsi" },
    debugFilterIssues: { en: "Issues", tr: "Sorunlar" },
    debugEmpty: { en: "No live calls yet", tr: "Henüz canlı çağrı yok" }
  }
} satisfies BmResourceInline<AopsCockpitFields, AopsCockpitTags>;

const i18n = new I18nBm<AopsCockpitFields, AopsCockpitTags>({
  config: {
    defaultLocale: "en",
    fallbackLocale: "en",
    defaultNamespace: "aopsCockpitV2"
  },
  inlineResources: resources
});

export function translateCockpit(
  key: AopsCockpitTranslationKey,
  locale: AopsCockpitLocale = "en"
): string {
  return i18n.tag(key, { locale });
}

export function useCockpitTranslator(locale: AopsCockpitLocale) {
  return useCallback(
    (key: AopsCockpitTranslationKey) => translateCockpit(key, locale),
    [locale]
  );
}
