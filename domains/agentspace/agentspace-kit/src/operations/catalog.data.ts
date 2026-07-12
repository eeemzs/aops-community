import type { AgentspaceOperationArgument, AgentspaceOperationEffect, AgentspaceOperationKind } from './types.js'

export type AgentspaceOperationCatalogRow = {
  toolId: string
  operationId: string
  summary: string
  examples?: readonly string[]
  serviceKey: string
  serviceEntity: string
  methodName: string
  kind: AgentspaceOperationKind
  sideEffect?: AgentspaceOperationEffect
  args: readonly AgentspaceOperationArgument[]
}

export const AGENTSPACE_OPERATION_CATALOG_ROWS = [
  {
    "toolId": "aops-agent-profile-create",
    "operationId": "agent-profile.create",
    "summary": "Create agent-profile.",
    "serviceKey": "agentProfileService",
    "serviceEntity": "agent-profile",
    "methodName": "createProfile",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-profile-delete",
    "operationId": "agent-profile.delete",
    "summary": "Delete agent-profile.",
    "serviceKey": "agentProfileService",
    "serviceEntity": "agent-profile",
    "methodName": "deleteProfile",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-profile-get-by-id",
    "operationId": "agent-profile.get-by-id",
    "summary": "Get by id agent-profile.",
    "serviceKey": "agentProfileService",
    "serviceEntity": "agent-profile",
    "methodName": "getProfileById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-profile-list",
    "operationId": "agent-profile.list",
    "summary": "List agent-profile.",
    "serviceKey": "agentProfileService",
    "serviceEntity": "agent-profile",
    "methodName": "listProfiles",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-profile-update",
    "operationId": "agent-profile.update",
    "summary": "Update agent-profile.",
    "serviceKey": "agentProfileService",
    "serviceEntity": "agent-profile",
    "methodName": "updateProfile",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-run-attach-run-to-task",
    "operationId": "agent-run.attach-run-to-task",
    "summary": "Attach run to task agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "attachRunToTask",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "taskId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-run-create",
    "operationId": "agent-run.create",
    "summary": "Create agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-run-get-agent-run",
    "operationId": "agent-run.get-agent-run",
    "summary": "Get agent run agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "getAgentRun",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-run-get-by-id",
    "operationId": "agent-run.get-by-id",
    "summary": "Get by id agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-run-list-agent-runs",
    "operationId": "agent-run.list-agent-runs",
    "summary": "List agent runs agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "listAgentRuns",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-run-record-agent-run",
    "operationId": "agent-run.record-agent-run",
    "summary": "Record agent run agent-run.",
    "serviceKey": "agentRunService",
    "serviceEntity": "agent-run",
    "methodName": "recordAgentRun",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-run-event-create",
    "operationId": "agent-run-event.create",
    "summary": "Create agent-run-event.",
    "serviceKey": "agentRunEventService",
    "serviceEntity": "agent-run-event",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-run-event-get-by-id",
    "operationId": "agent-run-event.get-by-id",
    "summary": "Get by id agent-run-event.",
    "serviceKey": "agentRunEventService",
    "serviceEntity": "agent-run-event",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-run-event-list-agent-run-events",
    "operationId": "agent-run-event.list-agent-run-events",
    "summary": "List agent run events agent-run-event.",
    "serviceKey": "agentRunEventService",
    "serviceEntity": "agent-run-event",
    "methodName": "listAgentRunEvents",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-activity-item-add-activity-item",
    "operationId": "activity-item.add-activity-item",
    "summary": "Add activity item activity-item.",
    "serviceKey": "activityItemService",
    "serviceEntity": "activity-item",
    "methodName": "addActivityItem",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-activity-item-get-by-id",
    "operationId": "activity-item.get-by-id",
    "summary": "Get by id activity-item.",
    "serviceKey": "activityItemService",
    "serviceEntity": "activity-item",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-activity-item-list-activity-items",
    "operationId": "activity-item.list-activity-items",
    "summary": "List activity items activity-item.",
    "serviceKey": "activityItemService",
    "serviceEntity": "activity-item",
    "methodName": "listActivityItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-session-create",
    "operationId": "agent-session.create",
    "summary": "Create agent-session.",
    "serviceKey": "agentSessionService",
    "serviceEntity": "agent-session",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-agent-session-end-agent-session",
    "operationId": "agent-session.end-agent-session",
    "summary": "End agent session agent-session.",
    "serviceKey": "agentSessionService",
    "serviceEntity": "agent-session",
    "methodName": "endAgentSession",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "status",
        "optional": true
      },
      {
        "name": "endedAt",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-session-get-by-id",
    "operationId": "agent-session.get-by-id",
    "summary": "Get by id agent-session.",
    "serviceKey": "agentSessionService",
    "serviceEntity": "agent-session",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-session-list-agent-sessions",
    "operationId": "agent-session.list-agent-sessions",
    "summary": "List agent sessions agent-session.",
    "serviceKey": "agentSessionService",
    "serviceEntity": "agent-session",
    "methodName": "listAgentSessions",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-agent-session-start-agent-session",
    "operationId": "agent-session.start-agent-session",
    "summary": "Start agent session agent-session.",
    "serviceKey": "agentSessionService",
    "serviceEntity": "agent-session",
    "methodName": "startAgentSession",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-link-create",
    "operationId": "artifact-link.create",
    "summary": "Create artifact-link.",
    "serviceKey": "artifactLinkService",
    "serviceEntity": "artifact-link",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-link-get-by-id",
    "operationId": "artifact-link.get-by-id",
    "summary": "Get by id artifact-link.",
    "serviceKey": "artifactLinkService",
    "serviceEntity": "artifact-link",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-link-link-artifact",
    "operationId": "artifact-link.link-artifact",
    "summary": "Link artifact artifact-link.",
    "serviceKey": "artifactLinkService",
    "serviceEntity": "artifact-link",
    "methodName": "linkArtifact",
    "kind": "update",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-link-list-artifact-links",
    "operationId": "artifact-link.list-artifact-links",
    "summary": "List artifact links artifact-link.",
    "serviceKey": "artifactLinkService",
    "serviceEntity": "artifact-link",
    "methodName": "listArtifactLinks",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-create",
    "operationId": "artifact.create",
    "summary": "Create artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-get-artifact",
    "operationId": "artifact.get-artifact",
    "summary": "Get artifact artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "getArtifact",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-get-by-id",
    "operationId": "artifact.get-by-id",
    "summary": "Get by id artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-link-artifact",
    "operationId": "artifact.link-artifact",
    "summary": "Link artifact artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "linkArtifact",
    "kind": "update",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-list-artifacts",
    "operationId": "artifact.list-artifacts",
    "summary": "List artifacts artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "listArtifacts",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-list-artifacts-by-ref",
    "operationId": "artifact.list-artifacts-by-ref",
    "summary": "List artifacts by ref artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "listArtifactsByRef",
    "kind": "list",
    "args": [
      {
        "name": "refType",
        "optional": false
      },
      {
        "name": "refId",
        "optional": false
      },
      {
        "name": "scopeId",
        "optional": true
      },
      {
        "name": "scopeResolution",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-artifact-store-artifact",
    "operationId": "artifact.store-artifact",
    "summary": "Store artifact artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "storeArtifact",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-artifact-remove-artifact",
    "operationId": "artifact.remove-artifact",
    "summary": "Remove artifact artifact.",
    "serviceKey": "artifactService",
    "serviceEntity": "artifact",
    "methodName": "removeArtifact",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-room-create",
    "operationId": "chat-room.create",
    "summary": "Create an agent chat room with initial members and optional bindings.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "createRoom",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-room-get-by-id",
    "operationId": "chat-room.get-by-id",
    "summary": "Get an agent chat room by id.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "getRoomById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-chat-room-list",
    "operationId": "chat-room.list",
    "summary": "List agent chat rooms.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "listRooms",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-chat-room-update",
    "operationId": "chat-room.update",
    "summary": "Update safe mutable chat room fields.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "updateRoom",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-room-archive",
    "operationId": "chat-room.archive",
    "summary": "Archive an agent chat room.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "archiveRoom",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "updatedBy",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-chat-room-open-dm",
    "operationId": "chat-room.open-dm",
    "summary": "Open or create a deterministic direct-message room for two agents.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "openDm",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-room-export-manifest",
    "operationId": "chat-room.export-manifest",
    "summary": "Export a room manifest with members, bindings, and optional messages.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-room",
    "methodName": "exportManifest",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-member-add",
    "operationId": "chat-member.add",
    "summary": "Add or reactivate an agent chat room member.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-member",
    "methodName": "addMember",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-member-update",
    "operationId": "chat-member.update",
    "summary": "Update chat room member fields.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-member",
    "methodName": "updateMember",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-member-remove",
    "operationId": "chat-member.remove",
    "summary": "Mark a chat room member as left.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-member",
    "methodName": "removeMember",
    "kind": "delete",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-binding-add",
    "operationId": "chat-binding.add",
    "summary": "Add a reference binding to a chat room.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-binding",
    "methodName": "addBinding",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-binding-remove",
    "operationId": "chat-binding.remove",
    "summary": "Remove a chat room reference binding.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-binding",
    "methodName": "removeBinding",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-message-send",
    "operationId": "chat-message.send",
    "summary": "Send an append-only message to a chat room.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-message",
    "methodName": "sendMessage",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-message-list",
    "operationId": "chat-message.list",
    "summary": "List chat room messages.",
    "serviceKey": "chatService",
    "serviceEntity": "chat-message",
    "methodName": "listMessages",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-chat-catchup",
    "operationId": "chat.catchup",
    "summary": "Read unread chat messages for an agent.",
    "serviceKey": "chatService",
    "serviceEntity": "chat",
    "methodName": "catchup",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-chat-mark-read",
    "operationId": "chat.mark-read",
    "summary": "Advance an agent read cursor in a chat room.",
    "serviceKey": "chatService",
    "serviceEntity": "chat",
    "methodName": "markRead",
    "kind": "update",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-create",
    "operationId": "discussion-topic.create",
    "summary": "Create a hosted discussion topic.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "createTopic",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-get",
    "operationId": "discussion-topic.get",
    "summary": "Get a hosted discussion topic with turns and outputs.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "getTopic",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-list",
    "operationId": "discussion-topic.list",
    "summary": "List hosted discussion topics.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "listTopics",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-discussion-turn-add",
    "operationId": "discussion-turn.add",
    "summary": "Append a turn to a hosted discussion topic.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-turn",
    "methodName": "addTurn",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-conclude",
    "operationId": "discussion-topic.conclude",
    "summary": "Conclude a hosted discussion topic.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "conclude",
    "kind": "custom",
    "sideEffect": "db",
    "args": [
      {
        "name": "topicId",
        "optional": false
      },
      {
        "name": "updatedBy",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-abandon",
    "operationId": "discussion-topic.abandon",
    "summary": "Abandon a hosted discussion topic.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "abandon",
    "kind": "custom",
    "sideEffect": "db",
    "args": [
      {
        "name": "topicId",
        "optional": false
      },
      {
        "name": "reason",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-discussion-output-set",
    "operationId": "discussion-output.set",
    "summary": "Set a hosted discussion topic output.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-output",
    "methodName": "setOutput",
    "kind": "custom",
    "sideEffect": "db",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-discussion-topic-status",
    "operationId": "discussion-topic.status",
    "summary": "Read hosted discussion topic status, next speaker, and conclude readiness.",
    "serviceKey": "discussionService",
    "serviceEntity": "discussion-topic",
    "methodName": "status",
    "kind": "custom",
    "args": [
      {
        "name": "topicId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-playbook-list",
    "operationId": "playbook.list",
    "summary": "List hosted read-only projections for playbooks stored as memory rules or constraints.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "playbook",
    "methodName": "listMemoryItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-add-message",
    "operationId": "codex-chat-message.add-message",
    "summary": "Add message codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "addMessage",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-create",
    "operationId": "codex-chat-message.create",
    "summary": "Create codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-get-by-id",
    "operationId": "codex-chat-message.get-by-id",
    "summary": "Get by id codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-list-messages",
    "operationId": "codex-chat-message.list-messages",
    "summary": "List messages codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "listMessages",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-remove-message",
    "operationId": "codex-chat-message.remove-message",
    "summary": "Remove message codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "removeMessage",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-message-update-message",
    "operationId": "codex-chat-message.update-message",
    "summary": "Update message codex-chat-message.",
    "serviceKey": "codexChatMessageService",
    "serviceEntity": "codex-chat-message",
    "methodName": "updateMessage",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-add-setting",
    "operationId": "codex-chat-setting.add-setting",
    "summary": "Add setting codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "addSetting",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-create",
    "operationId": "codex-chat-setting.create",
    "summary": "Create codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-get-by-id",
    "operationId": "codex-chat-setting.get-by-id",
    "summary": "Get by id codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-list-settings",
    "operationId": "codex-chat-setting.list-settings",
    "summary": "List settings codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "listSettings",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-remove-setting",
    "operationId": "codex-chat-setting.remove-setting",
    "summary": "Remove setting codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "removeSetting",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-setting-update-setting",
    "operationId": "codex-chat-setting.update-setting",
    "summary": "Update setting codex-chat-setting.",
    "serviceKey": "codexChatSettingService",
    "serviceEntity": "codex-chat-setting",
    "methodName": "updateSetting",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-add-thread",
    "operationId": "codex-chat-thread.add-thread",
    "summary": "Add thread codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "addThread",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-create",
    "operationId": "codex-chat-thread.create",
    "summary": "Create codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-get-by-id",
    "operationId": "codex-chat-thread.get-by-id",
    "summary": "Get by id codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-list-threads",
    "operationId": "codex-chat-thread.list-threads",
    "summary": "List threads codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "listThreads",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-remove-thread",
    "operationId": "codex-chat-thread.remove-thread",
    "summary": "Remove thread codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "removeThread",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-codex-chat-thread-update-thread",
    "operationId": "codex-chat-thread.update-thread",
    "summary": "Update thread codex-chat-thread.",
    "serviceKey": "codexChatThreadService",
    "serviceEntity": "codex-chat-thread",
    "methodName": "updateThread",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-add-column",
    "operationId": "kanban-board.add-column",
    "summary": "Add column kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "addColumn",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-create",
    "operationId": "kanban-board.create",
    "summary": "Create kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-create-board",
    "operationId": "kanban-board.create-board",
    "summary": "Create board kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "createBoard",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-ensure-default-board",
    "operationId": "kanban-board.ensure-default-board",
    "summary": "Ensure default board kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "ensureDefaultBoard",
    "kind": "custom",
    "args": [
      {
        "name": "projectId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-get-by-id",
    "operationId": "kanban-board.get-by-id",
    "summary": "Get by id kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-list-board",
    "operationId": "kanban-board.list-board",
    "summary": "List board kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "listBoard",
    "kind": "list",
    "args": [
      {
        "name": "boardId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-list-boards",
    "operationId": "kanban-board.list-boards",
    "summary": "List boards kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "listBoards",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-move-task-to-column",
    "operationId": "kanban-board.move-task-to-column",
    "summary": "Move task to column kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "moveTaskToColumn",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "toColumnId",
        "optional": false
      },
      {
        "name": "toPosition",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-reorder-columns",
    "operationId": "kanban-board.reorder-columns",
    "summary": "Reorder columns kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "reorderColumns",
    "kind": "update",
    "args": [
      {
        "name": "boardId",
        "optional": false
      },
      {
        "name": "orderedColumnIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-reorder-tasks-in-column",
    "operationId": "kanban-board.reorder-tasks-in-column",
    "summary": "Reorder tasks in column kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "reorderTasksInColumn",
    "kind": "update",
    "args": [
      {
        "name": "columnId",
        "optional": false
      },
      {
        "name": "orderedTaskIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-set-column-wip-limit",
    "operationId": "kanban-board.set-column-wip-limit",
    "summary": "Set column wip limit kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "setColumnWipLimit",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "wipLimit",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-update-board",
    "operationId": "kanban-board.update-board",
    "summary": "Update board kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "updateBoard",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-board-update-column",
    "operationId": "kanban-board.update-column",
    "summary": "Update column kanban-board.",
    "serviceKey": "kanbanBoardService",
    "serviceEntity": "kanban-board",
    "methodName": "updateColumn",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-add-column",
    "operationId": "kanban-column.add-column",
    "summary": "Add column kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "addColumn",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-create",
    "operationId": "kanban-column.create",
    "summary": "Create kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-get-by-id",
    "operationId": "kanban-column.get-by-id",
    "summary": "Get by id kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-list-columns",
    "operationId": "kanban-column.list-columns",
    "summary": "List columns kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "listColumns",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-reorder-columns",
    "operationId": "kanban-column.reorder-columns",
    "summary": "Reorder columns kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "reorderColumns",
    "kind": "update",
    "args": [
      {
        "name": "boardId",
        "optional": false
      },
      {
        "name": "orderedColumnIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-set-column-wip-limit",
    "operationId": "kanban-column.set-column-wip-limit",
    "summary": "Set column wip limit kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "setColumnWipLimit",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "wipLimit",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-kanban-column-update-column",
    "operationId": "kanban-column.update-column",
    "summary": "Update column kanban-column.",
    "serviceKey": "kanbanColumnService",
    "serviceEntity": "kanban-column",
    "methodName": "updateColumn",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-add-memory-item",
    "operationId": "memory-item.add-memory-item",
    "summary": "Add memory item memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "addMemoryItem",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-create",
    "operationId": "memory-item.create",
    "summary": "Create memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-get-by-id",
    "operationId": "memory-item.get-by-id",
    "summary": "Get by id memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-memory-item-list-memory-items",
    "operationId": "memory-item.list-memory-items",
    "summary": "List memory items memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "listMemoryItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-memory-item-remove-memory-item",
    "operationId": "memory-item.remove-memory-item",
    "summary": "Remove memory item memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "removeMemoryItem",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-search-memory-items",
    "operationId": "memory-item.search-memory-items",
    "summary": "Search memory items with retrieval ranking, recency, and linkage signals.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "searchMemoryItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "retrieval",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ],
    "examples": [
      "{\"filter\":{\"scopeId\":\"<scopeId>\",\"scopeResolution\":\"cascade\"},\"retrieval\":{\"query\":\"triage flaky workflow run\",\"subject\":{\"type\":\"projectman.issue\",\"id\":\"<issueId>\"},\"workflowId\":\"<workflowId>\",\"runtimeProfile\":\"investigation\"},\"options\":{\"limit\":8}}"
    ]
  },
  {
    "toolId": "aops-memory-item-build-resume-pack",
    "operationId": "memory-item.build-resume-pack",
    "summary": "Build a curated resume pack from memory-derived synopsis and related context signals.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "buildResumePack",
    "kind": "custom",
    "args": [
      {
        "name": "filter",
        "optional": false
      },
      {
        "name": "retrieval",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ],
    "examples": [
      "{\"filter\":{\"scopeId\":\"<scopeId>\",\"scopeResolution\":\"cascade\",\"projectId\":\"<projectId>\"},\"retrieval\":{\"query\":\"resume active sprint context\",\"subject\":{\"type\":\"projectman.sprint\",\"id\":\"<sprintId>\"},\"runtimeProfile\":\"planning\",\"sourceTypes\":[\"projectman.sprint\",\"projectman.microtask\"],\"sourceIds\":[\"<sprintId>\"]},\"options\":{\"depth\":\"light\",\"limit\":8}}"
    ]
  },
  {
    "toolId": "aops-memory-item-build-synopsis",
    "operationId": "memory-item.build-synopsis",
    "summary": "Build a generated synopsis from memory truth only.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "buildSynopsis",
    "kind": "custom",
    "args": [
      {
        "name": "filter",
        "optional": false
      },
      {
        "name": "retrieval",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ],
    "examples": [
      "{\"filter\":{\"scopeId\":\"<scopeId>\",\"scopeResolution\":\"cascade\",\"projectId\":\"<projectId>\"},\"retrieval\":{\"subject\":{\"type\":\"projectman.sprint\",\"id\":\"<sprintId>\"},\"query\":\"current sprint synopsis\"},\"options\":{\"limit\":8}}"
    ]
  },
  {
    "toolId": "aops-memory-item-set-memory-importance",
    "operationId": "memory-item.set-memory-importance",
    "summary": "Set memory importance memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "setMemoryImportance",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "importance",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-update-memory-item",
    "operationId": "memory-item.update-memory-item",
    "summary": "Update memory item memory-item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "updateMemoryItem",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-memory-item-promote-from-experience",
    "operationId": "memory-item.promote-from-experience",
    "summary": "Promote an experience item into a durable memory item, or (asPlaybook) a playbook-projectable rule/constraint memory item.",
    "serviceKey": "memoryItemService",
    "serviceEntity": "memory-item",
    "methodName": "promoteFromExperience",
    "kind": "custom",
    "sideEffect": "db",
    "args": [
      {
        "name": "experienceId",
        "optional": false
      },
      {
        "name": "asPlaybook",
        "optional": true
      },
      {
        "name": "overrides",
        "optional": true
      }
    ],
    "examples": [
      "{\"experienceId\":\"<experienceId>\"}",
      "{\"experienceId\":\"<experienceId>\",\"asPlaybook\":true,\"overrides\":{\"playbookArea\":\"backend\",\"reviewState\":\"accepted\"}}"
    ]
  },
  {
    "toolId": "aops-mission-create",
    "operationId": "mission.create",
    "summary": "Create an Agentspace mission record.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "createMission",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ],
    "examples": [
      "{\"data\":{\"scopeId\":\"<projectId>\",\"slug\":\"mission-slug\",\"objective\":\"Deliver PR1 mission support\",\"taskDefinition\":\"Implement mission + session binding\",\"successCriteria\":[\"mission.create works\",\"mission.resume returns schemaVersion 1\"],\"policy\":{\"method\":\"build-review-chat\"}}}"
    ]
  },
  {
    "toolId": "aops-mission-get",
    "operationId": "mission.get",
    "summary": "Get an Agentspace mission by id.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-mission-list",
    "operationId": "mission.list",
    "summary": "List Agentspace missions.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "listMissions",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-mission-update",
    "operationId": "mission.update",
    "summary": "Update an Agentspace mission.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "updateMission",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-mission-delete",
    "operationId": "mission.delete",
    "summary": "Delete an Agentspace mission.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "removeMission",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-mission-resume",
    "operationId": "mission.resume",
    "summary": "Build a deterministic mission-anchored resume pack skeleton.",
    "serviceKey": "missionService",
    "serviceEntity": "mission",
    "methodName": "buildResumePack",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ],
    "examples": [
      "{\"id\":\"<missionId>\",\"options\":{\"depth\":\"light\",\"limit\":8}}"
    ]
  },
  {
    "toolId": "aops-experience-item-add-experience-item",
    "operationId": "experience-item.add-experience-item",
    "summary": "Add experience item experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "addExperienceItem",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-experience-item-create",
    "operationId": "experience-item.create",
    "summary": "Create experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-experience-item-get-by-id",
    "operationId": "experience-item.get-by-id",
    "summary": "Get by id experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-experience-item-get-experience-item",
    "operationId": "experience-item.get-experience-item",
    "summary": "Get experience item experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "getExperienceItem",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-experience-item-list-experience-items",
    "operationId": "experience-item.list-experience-items",
    "summary": "List experience items experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "listExperienceItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-experience-item-remove-experience-item",
    "operationId": "experience-item.remove-experience-item",
    "summary": "Remove experience item experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "removeExperienceItem",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-experience-item-update-experience-item",
    "operationId": "experience-item.update-experience-item",
    "summary": "Update experience item experience-item.",
    "serviceKey": "experienceItemService",
    "serviceEntity": "experience-item",
    "methodName": "updateExperienceItem",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-member-create",
    "operationId": "project-member.create",
    "summary": "Create project-member.",
    "serviceKey": "projectMemberService",
    "serviceEntity": "project-member",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-member-get-by-id",
    "operationId": "project-member.get-by-id",
    "summary": "Get by id project-member.",
    "serviceKey": "projectMemberService",
    "serviceEntity": "project-member",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-member-list-project-members",
    "operationId": "project-member.list-project-members",
    "summary": "List project members project-member.",
    "serviceKey": "projectMemberService",
    "serviceEntity": "project-member",
    "methodName": "listProjectMembers",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-member-remove-project-member",
    "operationId": "project-member.remove-project-member",
    "summary": "Remove project member project-member.",
    "serviceKey": "projectMemberService",
    "serviceEntity": "project-member",
    "methodName": "removeProjectMember",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-member-update-project-member",
    "operationId": "project-member.update-project-member",
    "summary": "Update project member project-member.",
    "serviceKey": "projectMemberService",
    "serviceEntity": "project-member",
    "methodName": "updateProjectMember",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-path-create",
    "operationId": "project-path.create",
    "summary": "Create project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-path-get-by-id",
    "operationId": "project-path.get-by-id",
    "summary": "Get by id project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-path-list-project-paths",
    "operationId": "project-path.list-project-paths",
    "summary": "List project paths project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "listProjectPaths",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-path-remove-project-path",
    "operationId": "project-path.remove-project-path",
    "summary": "Remove project path project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "removeProjectPath",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-path-update-project-path",
    "operationId": "project-path.update-project-path",
    "summary": "Update project path project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "updateProjectPath",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-path-upsert-project-path",
    "operationId": "project-path.upsert-project-path",
    "summary": "Upsert project path project-path.",
    "serviceKey": "projectPathService",
    "serviceEntity": "project-path",
    "methodName": "upsertProjectPath",
    "kind": "custom",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-archive-project",
    "operationId": "project.archive-project",
    "summary": "Archive project project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "archiveProject",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-create",
    "operationId": "project.create",
    "summary": "Create project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-delete-cascade",
    "operationId": "project.delete-cascade",
    "summary": "Hard-delete project and linked records (child-first).",
    "serviceKey": "__calls__",
    "serviceEntity": "project",
    "methodName": "hardDeleteAgentspaceProjectCascade",
    "kind": "delete",
    "args": [
      {
        "name": "projectId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-get-by-id",
    "operationId": "project.get-by-id",
    "summary": "Get by id project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-get-project",
    "operationId": "project.get-project",
    "summary": "Get project project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "getProject",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-list-projects",
    "operationId": "project.list-projects",
    "summary": "List projects project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "listProjects",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-project-remove-project",
    "operationId": "project.remove-project",
    "summary": "Remove project project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "removeProject",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-set-project-type",
    "operationId": "project.set-project-type",
    "summary": "Set project type project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "setProjectType",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "projectType",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-set-project-visibility",
    "operationId": "project.set-project-visibility",
    "summary": "Set project visibility project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "setProjectVisibility",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "visibility",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-project-update-project",
    "operationId": "project.update-project",
    "summary": "Update project project.",
    "serviceKey": "projectService",
    "serviceEntity": "project",
    "methodName": "updateProject",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-create",
    "operationId": "prompt-version.create",
    "summary": "Create prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-get-by-id",
    "operationId": "prompt-version.get-by-id",
    "summary": "Get by id prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-get-prompt-version",
    "operationId": "prompt-version.get-prompt-version",
    "summary": "Get prompt version prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "getPromptVersion",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-list-prompt-versions",
    "operationId": "prompt-version.list-prompt-versions",
    "summary": "List prompt versions prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "listPromptVersions",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-publish-prompt-version",
    "operationId": "prompt-version.publish-prompt-version",
    "summary": "Publish prompt version prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "publishPromptVersion",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "publishedAt",
        "optional": true
      },
      {
        "name": "updatedBy",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-remove-prompt-version",
    "operationId": "prompt-version.remove-prompt-version",
    "summary": "Remove prompt version prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "removePromptVersion",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-version-update-prompt-version",
    "operationId": "prompt-version.update-prompt-version",
    "summary": "Update prompt version prompt-version.",
    "serviceKey": "promptVersionService",
    "serviceEntity": "prompt-version",
    "methodName": "updatePromptVersion",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-create",
    "operationId": "prompt.create",
    "summary": "Create prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-get-by-id",
    "operationId": "prompt.get-by-id",
    "summary": "Get by id prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-get-prompt",
    "operationId": "prompt.get-prompt",
    "summary": "Get prompt prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "getPrompt",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-list-prompts",
    "operationId": "prompt.list-prompts",
    "summary": "List prompts prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "listPrompts",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-prompt-remove-prompt",
    "operationId": "prompt.remove-prompt",
    "summary": "Remove prompt prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "removePrompt",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-prompt-update-prompt",
    "operationId": "prompt.update-prompt",
    "summary": "Update prompt prompt.",
    "serviceKey": "promptService",
    "serviceEntity": "prompt",
    "methodName": "updatePrompt",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-resource-create",
    "operationId": "resource.create",
    "summary": "Create resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-resource-create-resource",
    "operationId": "resource.create-resource",
    "summary": "Create resource resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "createResource",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-resource-get-by-id",
    "operationId": "resource.get-by-id",
    "summary": "Get by id resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-resource-get-resource",
    "operationId": "resource.get-resource",
    "summary": "Get resource resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "getResource",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-resource-list-resources",
    "operationId": "resource.list-resources",
    "summary": "List resources resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "listResources",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-resource-remove-resource",
    "operationId": "resource.remove-resource",
    "summary": "Remove resource resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "removeResource",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-resource-update-resource",
    "operationId": "resource.update-resource",
    "summary": "Update resource resource.",
    "serviceKey": "resourceService",
    "serviceEntity": "resource",
    "methodName": "updateResource",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-create",
    "operationId": "skill-version.create",
    "summary": "Create skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-export-skill-package",
    "operationId": "skill-version.export-skill-package",
    "summary": "Export a canonical filesystem skill package from a skill version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "exportSkillPackage",
    "kind": "custom",
    "examples": [
      "{\"id\":\"<skill-version-id>\"}"
    ],
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-get-by-id",
    "operationId": "skill-version.get-by-id",
    "summary": "Get by id skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-version-get-skill-version",
    "operationId": "skill-version.get-skill-version",
    "summary": "Get skill version skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "getSkillVersion",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-version-import-skill-package",
    "operationId": "skill-version.import-skill-package",
    "summary": "Import a canonical filesystem skill package into skill and skill-version records.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "importSkillPackage",
    "kind": "custom",
    "examples": [
      "{\"data\":{\"projectId\":\"<project-id>\",\"scopeType\":\"project\",\"createdBy\":\"cli\",\"updatedBy\":\"cli\",\"bundle\":{\"sourcePath\":\"/tmp/my-skill\",\"files\":[{\"path\":\"SKILL.md\",\"kind\":\"instruction\",\"content\":\"---\\nname: my-skill\\ndescription: Example skill\\n---\\n\\n# My Skill\\n\"}]}}}"
    ],
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-list-skill-versions",
    "operationId": "skill-version.list-skill-versions",
    "summary": "List skill versions skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "listSkillVersions",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-version-materialize-skill-package",
    "operationId": "skill-version.materialize-skill-package",
    "summary": "Materialize a canonical filesystem skill package to an output directory.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "materializeSkillPackage",
    "kind": "custom",
    "examples": [
      "{\"id\":\"<skill-version-id>\",\"data\":{\"outputDir\":\"/tmp/materialized-skill\",\"overwrite\":true}}"
    ],
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-publish-skill-version",
    "operationId": "skill-version.publish-skill-version",
    "summary": "Publish skill version skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "publishSkillVersion",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "updatedBy",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-version-remove-skill-version",
    "operationId": "skill-version.remove-skill-version",
    "summary": "Remove skill version skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "removeSkillVersion",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-version-update-skill-version",
    "operationId": "skill-version.update-skill-version",
    "summary": "Update skill version skill-version.",
    "serviceKey": "skillVersionService",
    "serviceEntity": "skill-version",
    "methodName": "updateSkillVersion",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-create",
    "operationId": "skill.create",
    "summary": "Create skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-get-by-id",
    "operationId": "skill.get-by-id",
    "summary": "Get by id skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-get-skill",
    "operationId": "skill.get-skill",
    "summary": "Get skill skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "getSkill",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-list-skills",
    "operationId": "skill.list-skills",
    "summary": "List skills skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "listSkills",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-skill-remove-skill",
    "operationId": "skill.remove-skill",
    "summary": "Remove skill skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "removeSkill",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-skill-update-skill",
    "operationId": "skill.update-skill",
    "summary": "Update skill skill.",
    "serviceKey": "skillService",
    "serviceEntity": "skill",
    "methodName": "updateSkill",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-add-sprint-item",
    "operationId": "sprint-item.add-sprint-item",
    "summary": "Add sprint item sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "addSprintItem",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-close-sprint-item",
    "operationId": "sprint-item.close-sprint-item",
    "summary": "Close sprint item sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "closeSprintItem",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "closedAt",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-create",
    "operationId": "sprint-item.create",
    "summary": "Create sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-get-by-id",
    "operationId": "sprint-item.get-by-id",
    "summary": "Get by id sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-list-sprint-items",
    "operationId": "sprint-item.list-sprint-items",
    "summary": "List sprint items sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "listSprintItems",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-remove-sprint-item",
    "operationId": "sprint-item.remove-sprint-item",
    "summary": "Remove sprint item sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "removeSprintItem",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-reorder-sprint-items",
    "operationId": "sprint-item.reorder-sprint-items",
    "summary": "Reorder sprint items sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "reorderSprintItems",
    "kind": "update",
    "args": [
      {
        "name": "sprintId",
        "optional": false
      },
      {
        "name": "orderedItemIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-item-update-sprint-item",
    "operationId": "sprint-item.update-sprint-item",
    "summary": "Update sprint item sprint-item.",
    "serviceKey": "sprintItemService",
    "serviceEntity": "sprint-item",
    "methodName": "updateSprintItem",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-activate-sprint",
    "operationId": "sprint.activate-sprint",
    "summary": "Activate sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "activateSprint",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-add-sprint-item",
    "operationId": "sprint.add-sprint-item",
    "summary": "Add sprint item sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "addSprintItem",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-close-sprint-item",
    "operationId": "sprint.close-sprint-item",
    "summary": "Close sprint item sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "closeSprintItem",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "closedAt",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-complete-sprint",
    "operationId": "sprint.complete-sprint",
    "summary": "Complete sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "completeSprint",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-create",
    "operationId": "sprint.create",
    "summary": "Create sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-get-by-id",
    "operationId": "sprint.get-by-id",
    "summary": "Get by id sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-get-sprint",
    "operationId": "sprint.get-sprint",
    "summary": "Get sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "getSprint",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-list-sprints",
    "operationId": "sprint.list-sprints",
    "summary": "List sprints sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "listSprints",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-sprint-remove-sprint",
    "operationId": "sprint.remove-sprint",
    "summary": "Remove sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "removeSprint",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-reorder-sprint-items",
    "operationId": "sprint.reorder-sprint-items",
    "summary": "Reorder sprint items sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "reorderSprintItems",
    "kind": "update",
    "args": [
      {
        "name": "sprintId",
        "optional": false
      },
      {
        "name": "orderedItemIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-supersede-sprint",
    "operationId": "sprint.supersede-sprint",
    "summary": "Supersede sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "supersedeSprint",
    "kind": "custom",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-update-sprint",
    "operationId": "sprint.update-sprint",
    "summary": "Update sprint sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "updateSprint",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-sprint-update-sprint-item",
    "operationId": "sprint.update-sprint-item",
    "summary": "Update sprint item sprint.",
    "serviceKey": "sprintService",
    "serviceEntity": "sprint",
    "methodName": "updateSprintItem",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-tag-create",
    "operationId": "tag.create",
    "summary": "Create tag.",
    "serviceKey": "tagService",
    "serviceEntity": "tag",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-tag-ensure-tags",
    "operationId": "tag.ensure-tags",
    "summary": "Ensure tags tag.",
    "serviceKey": "tagService",
    "serviceEntity": "tag",
    "methodName": "ensureTags",
    "kind": "custom",
    "args": [
      {
        "name": "input",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-tag-get-by-id",
    "operationId": "tag.get-by-id",
    "summary": "Get by id tag.",
    "serviceKey": "tagService",
    "serviceEntity": "tag",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-tag-list-tags",
    "operationId": "tag.list-tags",
    "summary": "List tags tag.",
    "serviceKey": "tagService",
    "serviceEntity": "tag",
    "methodName": "listTags",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-tag-search-tags",
    "operationId": "tag.search-tags",
    "summary": "Search tags tag.",
    "serviceKey": "tagService",
    "serviceEntity": "tag",
    "methodName": "searchTags",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": false
      },
      {
        "name": "query",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-comment-create",
    "operationId": "task-comment.create",
    "summary": "Create task-comment.",
    "serviceKey": "taskCommentService",
    "serviceEntity": "task-comment",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-comment-get-by-id",
    "operationId": "task-comment.get-by-id",
    "summary": "Get by id task-comment.",
    "serviceKey": "taskCommentService",
    "serviceEntity": "task-comment",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-comment-list-by-task",
    "operationId": "task-comment.list-by-task",
    "summary": "List by task task-comment.",
    "serviceKey": "taskCommentService",
    "serviceEntity": "task-comment",
    "methodName": "listByTask",
    "kind": "list",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-add-task-comment",
    "operationId": "task.add-task-comment",
    "summary": "Add task comment task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "addTaskComment",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-create",
    "operationId": "task.create",
    "summary": "Create task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-create-task",
    "operationId": "task.create-task",
    "summary": "Create task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "createTask",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-get-by-id",
    "operationId": "task.get-by-id",
    "summary": "Get by id task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-get-task",
    "operationId": "task.get-task",
    "summary": "Get task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "getTask",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-link-task-to-sprint",
    "operationId": "task.link-task-to-sprint",
    "summary": "Link task to sprint task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "linkTaskToSprint",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "sprintId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-list-task-comments",
    "operationId": "task.list-task-comments",
    "summary": "List task comments task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "listTaskComments",
    "kind": "list",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-move-task-to-column",
    "operationId": "task.move-task-to-column",
    "summary": "Move task to column task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "moveTaskToColumn",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "toColumnId",
        "optional": false
      },
      {
        "name": "toPosition",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-reorder-task",
    "operationId": "task.reorder-task",
    "summary": "Reorder task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "reorderTask",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "toPosition",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-reorder-tasks-in-column",
    "operationId": "task.reorder-tasks-in-column",
    "summary": "Reorder tasks in column task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "reorderTasksInColumn",
    "kind": "update",
    "args": [
      {
        "name": "columnId",
        "optional": false
      },
      {
        "name": "orderedTaskIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-search-tasks",
    "operationId": "task.search-tasks",
    "summary": "Search tasks task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "searchTasks",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-set-task-assignee",
    "operationId": "task.set-task-assignee",
    "summary": "Set task assignee task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "setTaskAssignee",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "assignee",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-set-task-due-date",
    "operationId": "task.set-task-due-date",
    "summary": "Set task due date task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "setTaskDueDate",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "dueAt",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-set-task-parent",
    "operationId": "task.set-task-parent",
    "summary": "Set task parent task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "setTaskParent",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "parentTaskId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-set-task-priority",
    "operationId": "task.set-task-priority",
    "summary": "Set task priority task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "setTaskPriority",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "priority",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-unlink-task-from-sprint",
    "operationId": "task.unlink-task-from-sprint",
    "summary": "Unlink task from sprint task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "unlinkTaskFromSprint",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-update-task",
    "operationId": "task.update-task",
    "summary": "Update task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "updateTask",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "patch",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-delete-task",
    "operationId": "task.delete-task",
    "summary": "Delete task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "deleteTask",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-create-task-label",
    "operationId": "task.create-task-label",
    "summary": "Create task label task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "createTaskLabel",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-delete-task-label",
    "operationId": "task.delete-task-label",
    "summary": "Delete task label task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "deleteTaskLabel",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-list-task-labels",
    "operationId": "task.list-task-labels",
    "summary": "List task labels task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "listTaskLabels",
    "kind": "list",
    "args": [
      {
        "name": "scopeId",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-list-labels-for-task",
    "operationId": "task.list-labels-for-task",
    "summary": "List labels for task task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "listLabelsForTask",
    "kind": "list",
    "args": [
      {
        "name": "taskId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-set-task-label",
    "operationId": "task.set-task-label",
    "summary": "Set task label task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "setTaskLabel",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "labelId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-unset-task-label",
    "operationId": "task.unset-task-label",
    "summary": "Unset task label task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "unsetTaskLabel",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "labelId",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-add-checklist-item",
    "operationId": "task.add-checklist-item",
    "summary": "Add checklist item task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "addChecklistItem",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-toggle-checklist-item",
    "operationId": "task.toggle-checklist-item",
    "summary": "Toggle checklist item task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "toggleChecklistItem",
    "kind": "update",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "isDone",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-remove-checklist-item",
    "operationId": "task.remove-checklist-item",
    "summary": "Remove checklist item task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "removeChecklistItem",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-reorder-checklist-items",
    "operationId": "task.reorder-checklist-items",
    "summary": "Reorder checklist items task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "reorderChecklistItems",
    "kind": "update",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "orderedItemIds",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-list-checklist-items",
    "operationId": "task.list-checklist-items",
    "summary": "List checklist items task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "listChecklistItems",
    "kind": "list",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-task-add-task-relation",
    "operationId": "task.add-task-relation",
    "summary": "Add task relation task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "addTaskRelation",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-remove-task-relation",
    "operationId": "task.remove-task-relation",
    "summary": "Remove task relation task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "removeTaskRelation",
    "kind": "delete",
    "args": [
      {
        "name": "id",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-task-list-task-relations",
    "operationId": "task.list-task-relations",
    "summary": "List task relations task.",
    "serviceKey": "taskService",
    "serviceEntity": "task",
    "methodName": "listTaskRelations",
    "kind": "list",
    "args": [
      {
        "name": "taskId",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-definition-create",
    "operationId": "workflow-definition.create",
    "summary": "Create workflow-definition.",
    "serviceKey": "workflowDefinitionService",
    "serviceEntity": "workflow-definition",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-workflow-definition-get-by-id",
    "operationId": "workflow-definition.get-by-id",
    "summary": "Get by id workflow-definition.",
    "serviceKey": "workflowDefinitionService",
    "serviceEntity": "workflow-definition",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-definition-list-workflow-definitions",
    "operationId": "workflow-definition.list-workflow-definitions",
    "summary": "List workflow definitions workflow-definition.",
    "serviceKey": "workflowDefinitionService",
    "serviceEntity": "workflow-definition",
    "methodName": "listWorkflowDefinitions",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-definition-upsert-workflow-definition",
    "operationId": "workflow-definition.upsert-workflow-definition",
    "summary": "Upsert workflow-definition.",
    "serviceKey": "workflowDefinitionService",
    "serviceEntity": "workflow-definition",
    "methodName": "upsertWorkflowDefinition",
    "kind": "update",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-workflow-instance-create",
    "operationId": "workflow-instance.create",
    "summary": "Create workflow-instance.",
    "serviceKey": "workflowInstanceService",
    "serviceEntity": "workflow-instance",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-workflow-instance-get-by-id",
    "operationId": "workflow-instance.get-by-id",
    "summary": "Get by id workflow-instance.",
    "serviceKey": "workflowInstanceService",
    "serviceEntity": "workflow-instance",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-instance-list-workflow-instances",
    "operationId": "workflow-instance.list-workflow-instances",
    "summary": "List workflow instances workflow-instance.",
    "serviceKey": "workflowInstanceService",
    "serviceEntity": "workflow-instance",
    "methodName": "listWorkflowInstances",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-step-run-create",
    "operationId": "workflow-step-run.create",
    "summary": "Create workflow-step-run.",
    "serviceKey": "workflowStepRunService",
    "serviceEntity": "workflow-step-run",
    "methodName": "create",
    "kind": "create",
    "args": [
      {
        "name": "data",
        "optional": false
      }
    ]
  },
  {
    "toolId": "aops-workflow-step-run-get-by-id",
    "operationId": "workflow-step-run.get-by-id",
    "summary": "Get by id workflow-step-run.",
    "serviceKey": "workflowStepRunService",
    "serviceEntity": "workflow-step-run",
    "methodName": "getById",
    "kind": "get",
    "args": [
      {
        "name": "id",
        "optional": false
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
  {
    "toolId": "aops-workflow-step-run-list-workflow-step-runs",
    "operationId": "workflow-step-run.list-workflow-step-runs",
    "summary": "List workflow step runs workflow-step-run.",
    "serviceKey": "workflowStepRunService",
    "serviceEntity": "workflow-step-run",
    "methodName": "listWorkflowStepRuns",
    "kind": "list",
    "args": [
      {
        "name": "filter",
        "optional": true
      },
      {
        "name": "options",
        "optional": true
      }
    ]
  },
] as const satisfies readonly AgentspaceOperationCatalogRow[]
