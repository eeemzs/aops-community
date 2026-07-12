CREATE TABLE "activity-items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"projectId" uuid,
	"sourceKind" text NOT NULL,
	"sourceId" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent-profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"projectId" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"version" integer,
	"kind" text,
	"defaultAgents" jsonb,
	"capabilities" jsonb,
	"allowedSurfaces" jsonb,
	"requiresApprovalFor" jsonb,
	"promptRef" text,
	"skillRefs" jsonb,
	"resourceRefs" jsonb,
	"overlayRefs" jsonb,
	"additionalContextRefs" jsonb,
	"body" text,
	"tags" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent-run-events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"agentRunId" uuid NOT NULL,
	"runId" text NOT NULL,
	"eventId" text NOT NULL,
	"sequence" integer NOT NULL,
	"eventType" text NOT NULL,
	"status" text,
	"payload" jsonb,
	"meta" jsonb,
	"emittedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent-runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"projectId" uuid,
	"agentSessionId" uuid NOT NULL,
	"taskId" uuid,
	"runId" text NOT NULL,
	"sessionId" text NOT NULL,
	"agent" text NOT NULL,
	"profile" text,
	"model" text,
	"outputFormat" text,
	"tokensUsed" integer,
	"costUsd" double precision,
	"exitCode" integer,
	"stdout" text,
	"stderr" text,
	"resultText" text,
	"startedAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"durationMs" integer,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent-sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"missionId" uuid,
	"sessionId" text NOT NULL,
	"agent" text NOT NULL,
	"profile" text,
	"model" text,
	"status" text NOT NULL,
	"startedAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "artifact-links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"artifactId" uuid NOT NULL,
	"refType" text NOT NULL,
	"refId" text NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"artifactType" text NOT NULL,
	"label" text,
	"storagePath" text NOT NULL,
	"mimeType" text,
	"sizeBytes" integer,
	"hash" text,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat-messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"roomId" uuid NOT NULL,
	"seq" integer NOT NULL,
	"authorAgentId" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"mentions" jsonb,
	"replyToSeq" integer,
	"idempotencyKey" text,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat-room-bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"roomId" uuid NOT NULL,
	"bindingType" text NOT NULL,
	"refId" text,
	"uri" text,
	"title" text,
	"note" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat-room-members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"roomId" uuid NOT NULL,
	"agentId" text NOT NULL,
	"roleKey" text NOT NULL,
	"brief" text,
	"status" text NOT NULL,
	"lastReadSeq" integer DEFAULT 0 NOT NULL,
	"joinedAt" timestamp with time zone NOT NULL,
	"leftAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat-rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"projectId" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"purpose" text,
	"guidanceMarkdown" text,
	"status" text NOT NULL,
	"dmKey" text,
	"lastSeq" integer DEFAULT 0 NOT NULL,
	"lastMessageAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "codex-chat-messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"threadId" uuid NOT NULL,
	"externalThreadId" text,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"turnId" text,
	"itemId" text,
	"messageAt" timestamp with time zone NOT NULL,
	"seq" integer NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "codex-chat-settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"userId" text NOT NULL,
	"binaryPath" text,
	"model" text,
	"modelProvider" text,
	"reasoningEffort" text,
	"profile" text,
	"serviceTier" text,
	"personality" text,
	"approvalsReviewer" text,
	"executionMode" text NOT NULL,
	"sandboxMode" text NOT NULL,
	"manualCwd" text,
	"autoStart" boolean,
	"persistExtendedHistory" boolean,
	"experimentalApi" boolean,
	"optOutNotificationMethods" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "codex-chat-threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"externalThreadId" text NOT NULL,
	"scopeLabel" text,
	"cwd" text,
	"title" text,
	"tags" jsonb,
	"lastPrompt" text,
	"lastAssistant" text,
	"tokenInput" integer,
	"tokenOutput" integer,
	"tokenTotal" integer,
	"lastMessageAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discussion-outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"topicId" uuid NOT NULL,
	"outputKind" text NOT NULL,
	"ownerAgentId" text NOT NULL,
	"content" text NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discussion-topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"projectId" uuid,
	"parentTopicId" uuid,
	"lineageKind" text,
	"referencedOutputs" jsonb,
	"referencedTurnRefs" jsonb,
	"referencedMemoryRefs" jsonb,
	"abandonReason" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"participants" jsonb,
	"initiatorAgentId" text NOT NULL,
	"status" text NOT NULL,
	"blockedOn" text,
	"blockingTurnSeq" integer,
	"subjectType" text,
	"subjectId" uuid,
	"rules" jsonb,
	"tags" jsonb,
	"lastSeq" integer DEFAULT 0 NOT NULL,
	"lastTurnAt" timestamp with time zone,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discussion-turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"topicId" uuid NOT NULL,
	"seq" integer NOT NULL,
	"agentId" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"addressedTo" text,
	"replyToSeq" integer,
	"idempotencyKey" text,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience-items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"problem" text,
	"solution" text,
	"content" text NOT NULL,
	"areas" jsonb,
	"stack" jsonb,
	"commands" jsonb,
	"files" jsonb,
	"sourceRefs" jsonb,
	"tags" jsonb,
	"confidence" text,
	"reusability" text,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "memory-items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"kind" text NOT NULL,
	"durability" text NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb,
	"importance" integer,
	"sourceType" text,
	"sourceId" text,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"slug" text,
	"status" text NOT NULL,
	"objective" text NOT NULL,
	"taskDefinition" text,
	"successCriteria" jsonb,
	"constraints" jsonb,
	"policy" jsonb,
	"roles" jsonb,
	"references" jsonb,
	"visionDocRef" jsonb,
	"activeImplementationPlanRef" jsonb,
	"lineage" jsonb,
	"sourceTemplateRef" jsonb,
	"bodyMarkdown" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project-members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"role" text NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project-paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"pathKey" text NOT NULL,
	"path" text NOT NULL,
	"description" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb,
	"slug" text,
	"status" text,
	"visibility" text,
	"projectType" text,
	"ownerId" text,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"currentVersionId" uuid,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prompt-versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"promptId" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"content" text NOT NULL,
	"variables" jsonb,
	"meta" jsonb,
	"refType" text,
	"refId" text,
	"createdBy" text,
	"updatedBy" text,
	"publishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"resourceType" text NOT NULL,
	"uri" text,
	"tags" jsonb,
	"refType" text,
	"refId" text,
	"meta" jsonb,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"type" text NOT NULL,
	"parentScopeId" uuid,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"shortDescription" text,
	"tags" jsonb,
	"currentVersionId" uuid,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skill-versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"projectId" uuid NOT NULL,
	"skillId" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"content" text NOT NULL,
	"entryFile" text,
	"skillStandard" text DEFAULT 'aops-skill-v1' NOT NULL,
	"files" jsonb,
	"meta" jsonb,
	"refType" text,
	"refId" text,
	"createdBy" text,
	"updatedBy" text,
	"publishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"scopeType" text NOT NULL,
	"name" text NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow-definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"definitionId" text NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"subjectType" text,
	"runtimeProfile" text,
	"steps" jsonb NOT NULL,
	"policies" jsonb,
	"meta" jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow-instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"workflowInstanceId" text NOT NULL,
	"definitionId" text,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"subjectType" text NOT NULL,
	"subjectId" text NOT NULL,
	"subjectLabel" text,
	"subjectMeta" jsonb,
	"input" jsonb,
	"currentStepId" text,
	"activeApprovalId" text,
	"runtimeProfile" text,
	"runRecordIds" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"definitionSnapshot" jsonb,
	"meta" jsonb,
	"openedAt" timestamp with time zone NOT NULL,
	"closedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow-step-runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text NOT NULL,
	"scopeId" uuid NOT NULL,
	"workflowId" uuid NOT NULL,
	"workflowInstanceId" text NOT NULL,
	"stepId" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"status" text NOT NULL,
	"agentRunId" uuid,
	"approvalId" text,
	"childWorkflowId" uuid,
	"childWorkflowInstanceId" text,
	"input" jsonb,
	"approval" jsonb,
	"error" jsonb,
	"meta" jsonb,
	"openedAt" timestamp with time zone NOT NULL,
	"closedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agent-profiles" ADD CONSTRAINT "agent-profiles_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent-run-events" ADD CONSTRAINT "agent-run-events_agentRunId_agent-runs_id_fk" FOREIGN KEY ("agentRunId") REFERENCES "public"."agent-runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent-runs" ADD CONSTRAINT "agent-runs_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent-runs" ADD CONSTRAINT "agent-runs_agentSessionId_agent-sessions_id_fk" FOREIGN KEY ("agentSessionId") REFERENCES "public"."agent-sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact-links" ADD CONSTRAINT "artifact-links_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact-links" ADD CONSTRAINT "artifact-links_artifactId_artifacts_id_fk" FOREIGN KEY ("artifactId") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat-messages" ADD CONSTRAINT "chat-messages_roomId_chat-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat-room-bindings" ADD CONSTRAINT "chat-room-bindings_roomId_chat-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat-room-members" ADD CONSTRAINT "chat-room-members_roomId_chat-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat-rooms" ADD CONSTRAINT "chat-rooms_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex-chat-messages" ADD CONSTRAINT "codex-chat-messages_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex-chat-messages" ADD CONSTRAINT "codex-chat-messages_threadId_codex-chat-threads_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."codex-chat-threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion-outputs" ADD CONSTRAINT "discussion-outputs_topicId_discussion-topics_id_fk" FOREIGN KEY ("topicId") REFERENCES "public"."discussion-topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion-topics" ADD CONSTRAINT "discussion-topics_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion-topics" ADD CONSTRAINT "discussion-topics_parentTopicId_discussion-topics_id_fk" FOREIGN KEY ("parentTopicId") REFERENCES "public"."discussion-topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion-turns" ADD CONSTRAINT "discussion-turns_topicId_discussion-topics_id_fk" FOREIGN KEY ("topicId") REFERENCES "public"."discussion-topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project-members" ADD CONSTRAINT "project-members_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project-paths" ADD CONSTRAINT "project-paths_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_scopeId_scopes_id_fk" FOREIGN KEY ("scopeId") REFERENCES "public"."scopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt-versions" ADD CONSTRAINT "prompt-versions_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt-versions" ADD CONSTRAINT "prompt-versions_promptId_prompts_id_fk" FOREIGN KEY ("promptId") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill-versions" ADD CONSTRAINT "skill-versions_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill-versions" ADD CONSTRAINT "skill-versions_skillId_skills_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow-step-runs" ADD CONSTRAINT "workflow-step-runs_workflowId_workflow-instances_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflow-instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow-step-runs" ADD CONSTRAINT "workflow-step-runs_agentRunId_agent-runs_id_fk" FOREIGN KEY ("agentRunId") REFERENCES "public"."agent-runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow-step-runs" ADD CONSTRAINT "workflow-step-runs_childWorkflowId_workflow-instances_id_fk" FOREIGN KEY ("childWorkflowId") REFERENCES "public"."workflow-instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_item_idx_scope_created" ON "activity-items" USING btree ("tenantId","scopeId","createdAt");--> statement-breakpoint
CREATE INDEX "activity_item_idx_project_created" ON "activity-items" USING btree ("tenantId","projectId","createdAt");--> statement-breakpoint
CREATE INDEX "activity_item_idx_source_kind_created" ON "activity-items" USING btree ("tenantId","sourceKind","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profile_tenant_scope_slug_unique" ON "agent-profiles" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE INDEX "agent_profile_idx_tenant" ON "agent-profiles" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agent_profile_idx_scope_role" ON "agent-profiles" USING btree ("tenantId","scopeId","role");--> statement-breakpoint
CREATE INDEX "agent_profile_idx_scope_updated" ON "agent-profiles" USING btree ("tenantId","scopeId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_event_unique_run_sequence" ON "agent-run-events" USING btree ("tenantId","agentRunId","sequence");--> statement-breakpoint
CREATE INDEX "agent_run_event_idx_scope_emitted" ON "agent-run-events" USING btree ("tenantId","scopeId","emittedAt");--> statement-breakpoint
CREATE INDEX "agent_run_event_idx_run_id" ON "agent-run-events" USING btree ("tenantId","runId");--> statement-breakpoint
CREATE INDEX "agent_run_event_idx_type" ON "agent-run-events" USING btree ("tenantId","eventType");--> statement-breakpoint
CREATE INDEX "agent_run_idx_tenant" ON "agent-runs" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agent_run_idx_scope" ON "agent-runs" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "agent_run_idx_session_started" ON "agent-runs" USING btree ("tenantId","agentSessionId","startedAt");--> statement-breakpoint
CREATE INDEX "agent_run_idx_task_started" ON "agent-runs" USING btree ("tenantId","taskId","startedAt");--> statement-breakpoint
CREATE INDEX "agent_run_idx_project" ON "agent-runs" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "agent_session_idx_tenant" ON "agent-sessions" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "agent_session_idx_scope" ON "agent-sessions" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "agent_session_idx_mission" ON "agent-sessions" USING btree ("tenantId","missionId");--> statement-breakpoint
CREATE INDEX "agent_session_idx_scope_started" ON "agent-sessions" USING btree ("tenantId","scopeId","startedAt");--> statement-breakpoint
CREATE INDEX "artifact_link_idx_tenant" ON "artifact-links" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "artifact_link_idx_artifact" ON "artifact-links" USING btree ("tenantId","artifactId");--> statement-breakpoint
CREATE INDEX "artifact_link_idx_project_ref_created" ON "artifact-links" USING btree ("tenantId","projectId","refType","refId","createdAt");--> statement-breakpoint
CREATE INDEX "artifact_idx_tenant" ON "artifacts" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "artifact_idx_scope_created" ON "artifacts" USING btree ("tenantId","scopeId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_tenant_room_seq_unique" ON "chat-messages" USING btree ("tenantId","roomId","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_tenant_room_idempotency_unique" ON "chat-messages" USING btree ("tenantId","roomId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "chat_message_idx_tenant" ON "chat-messages" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "chat_message_idx_room_seq" ON "chat-messages" USING btree ("tenantId","roomId","seq");--> statement-breakpoint
CREATE INDEX "chat_message_idx_room_created" ON "chat-messages" USING btree ("tenantId","roomId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_message_idx_scope_created" ON "chat-messages" USING btree ("tenantId","scopeId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_message_idx_author_created" ON "chat-messages" USING btree ("tenantId","authorAgentId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_room_binding_idx_tenant" ON "chat-room-bindings" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "chat_room_binding_idx_room_type" ON "chat-room-bindings" USING btree ("tenantId","roomId","bindingType");--> statement-breakpoint
CREATE INDEX "chat_room_binding_idx_scope_type" ON "chat-room-bindings" USING btree ("tenantId","scopeId","bindingType");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_member_tenant_room_agent_unique" ON "chat-room-members" USING btree ("tenantId","roomId","agentId");--> statement-breakpoint
CREATE INDEX "chat_room_member_idx_tenant" ON "chat-room-members" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "chat_room_member_idx_room_status" ON "chat-room-members" USING btree ("tenantId","roomId","status");--> statement-breakpoint
CREATE INDEX "chat_room_member_idx_scope_agent" ON "chat-room-members" USING btree ("tenantId","scopeId","agentId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_tenant_scope_slug_unique" ON "chat-rooms" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_tenant_scope_dm_key_unique" ON "chat-rooms" USING btree ("tenantId","scopeId","dmKey");--> statement-breakpoint
CREATE INDEX "chat_room_idx_tenant" ON "chat-rooms" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "chat_room_idx_scope_updated" ON "chat-rooms" USING btree ("tenantId","scopeId","updatedAt");--> statement-breakpoint
CREATE INDEX "chat_room_idx_project_updated" ON "chat-rooms" USING btree ("tenantId","projectId","updatedAt");--> statement-breakpoint
CREATE INDEX "chat_room_idx_scope_last_message" ON "chat-rooms" USING btree ("tenantId","scopeId","lastMessageAt");--> statement-breakpoint
CREATE UNIQUE INDEX "codex_chat_message_tenant_thread_seq_unique" ON "codex-chat-messages" USING btree ("tenantId","threadId","seq");--> statement-breakpoint
CREATE INDEX "codex_chat_message_idx_tenant" ON "codex-chat-messages" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "codex_chat_message_idx_thread_messageat" ON "codex-chat-messages" USING btree ("tenantId","threadId","messageAt");--> statement-breakpoint
CREATE INDEX "codex_chat_message_idx_project_messageat" ON "codex-chat-messages" USING btree ("tenantId","projectId","messageAt");--> statement-breakpoint
CREATE UNIQUE INDEX "codex_chat_setting_tenant_project_user_unique" ON "codex-chat-settings" USING btree ("tenantId","projectId","userId");--> statement-breakpoint
CREATE INDEX "codex_chat_setting_idx_tenant" ON "codex-chat-settings" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "codex_chat_setting_idx_project_user" ON "codex-chat-settings" USING btree ("tenantId","projectId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "codex_chat_thread_tenant_scope_external_unique" ON "codex-chat-threads" USING btree ("tenantId","scopeId","externalThreadId");--> statement-breakpoint
CREATE INDEX "codex_chat_thread_idx_tenant" ON "codex-chat-threads" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "codex_chat_thread_idx_scope_updated" ON "codex-chat-threads" USING btree ("tenantId","scopeId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_output_tenant_topic_kind_unique" ON "discussion-outputs" USING btree ("tenantId","topicId","outputKind");--> statement-breakpoint
CREATE INDEX "discussion_output_idx_tenant" ON "discussion-outputs" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "discussion_output_idx_topic" ON "discussion-outputs" USING btree ("tenantId","topicId");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_topic_tenant_scope_slug_unique" ON "discussion-topics" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE INDEX "discussion_topic_idx_tenant" ON "discussion-topics" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "discussion_topic_idx_scope_updated" ON "discussion-topics" USING btree ("tenantId","scopeId","updatedAt");--> statement-breakpoint
CREATE INDEX "discussion_topic_idx_project_updated" ON "discussion-topics" USING btree ("tenantId","projectId","updatedAt");--> statement-breakpoint
CREATE INDEX "discussion_topic_idx_scope_status" ON "discussion-topics" USING btree ("tenantId","scopeId","status");--> statement-breakpoint
CREATE INDEX "discussion_topic_idx_tenant_parent" ON "discussion-topics" USING btree ("tenantId","parentTopicId");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_turn_tenant_topic_seq_unique" ON "discussion-turns" USING btree ("tenantId","topicId","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_turn_tenant_topic_idempotency_unique" ON "discussion-turns" USING btree ("tenantId","topicId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "discussion_turn_idx_tenant" ON "discussion-turns" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "discussion_turn_idx_topic_seq" ON "discussion-turns" USING btree ("tenantId","topicId","seq");--> statement-breakpoint
CREATE INDEX "discussion_turn_idx_topic_created" ON "discussion-turns" USING btree ("tenantId","topicId","createdAt");--> statement-breakpoint
CREATE INDEX "experience_item_idx_tenant" ON "experience-items" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "experience_item_idx_scope" ON "experience-items" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "experience_item_idx_type" ON "experience-items" USING btree ("tenantId","type");--> statement-breakpoint
CREATE INDEX "memory_item_idx_tenant" ON "memory-items" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "memory_item_idx_scope" ON "memory-items" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "memory_item_idx_kind" ON "memory-items" USING btree ("tenantId","kind");--> statement-breakpoint
CREATE INDEX "memory_item_idx_durability" ON "memory-items" USING btree ("tenantId","durability");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_scope_slug_unique" ON "missions" USING btree ("tenantId","scopeId","slug");--> statement-breakpoint
CREATE INDEX "mission_idx_tenant" ON "missions" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "mission_idx_scope" ON "missions" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "mission_idx_status" ON "missions" USING btree ("tenantId","scopeId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_unique_user" ON "project-members" USING btree ("tenantId","projectId","userId");--> statement-breakpoint
CREATE INDEX "project_member_idx_tenant" ON "project-members" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "project_member_idx_project" ON "project-members" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "project_member_idx_user" ON "project-members" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "project_path_unique_key" ON "project-paths" USING btree ("tenantId","projectId","pathKey");--> statement-breakpoint
CREATE INDEX "project_path_idx_tenant" ON "project-paths" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "project_path_idx_project" ON "project-paths" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX "project_scope_unique" ON "projects" USING btree ("scopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "project_slug_tenant_unique" ON "projects" USING btree ("tenantId","slug");--> statement-breakpoint
CREATE INDEX "project_idx_tenant" ON "projects" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_scope_name_tenant_unique" ON "prompts" USING btree ("tenantId","scopeId","name");--> statement-breakpoint
CREATE INDEX "prompt_idx_tenant" ON "prompts" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "prompt_idx_scope" ON "prompts" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_version_unique" ON "prompt-versions" USING btree ("tenantId","promptId","version");--> statement-breakpoint
CREATE INDEX "prompt_version_idx_tenant" ON "prompt-versions" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "prompt_version_idx_project" ON "prompt-versions" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "prompt_version_idx_prompt" ON "prompt-versions" USING btree ("tenantId","promptId");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_scope_ref_unique" ON "resources" USING btree ("tenantId","scopeId","refType","refId");--> statement-breakpoint
CREATE INDEX "resource_idx_tenant" ON "resources" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "resource_idx_scope" ON "resources" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "scope_idx_tenant" ON "scopes" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "scope_idx_parent" ON "scopes" USING btree ("tenantId","parentScopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_scope_name_tenant_unique" ON "skills" USING btree ("tenantId","scopeId","name");--> statement-breakpoint
CREATE INDEX "skill_idx_tenant" ON "skills" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "skill_idx_scope" ON "skills" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_version_unique" ON "skill-versions" USING btree ("tenantId","skillId","version");--> statement-breakpoint
CREATE INDEX "skill_version_idx_tenant" ON "skill-versions" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "skill_version_idx_project" ON "skill-versions" USING btree ("tenantId","projectId");--> statement-breakpoint
CREATE INDEX "skill_version_idx_skill" ON "skill-versions" USING btree ("tenantId","skillId");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_scope_name_tenant_unique" ON "tags" USING btree ("tenantId","scopeId","scopeType","name");--> statement-breakpoint
CREATE INDEX "tag_idx_tenant" ON "tags" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "tag_idx_scope" ON "tags" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "tag_idx_target_type" ON "tags" USING btree ("tenantId","scopeType");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definition_unique_definition_id" ON "workflow-definitions" USING btree ("tenantId","scopeId","definitionId");--> statement-breakpoint
CREATE INDEX "workflow_definition_idx_scope_mode" ON "workflow-definitions" USING btree ("tenantId","scopeId","mode");--> statement-breakpoint
CREATE INDEX "workflow_definition_idx_scope_subject" ON "workflow-definitions" USING btree ("tenantId","scopeId","subjectType");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_instance_unique_instance_id" ON "workflow-instances" USING btree ("tenantId","scopeId","workflowInstanceId");--> statement-breakpoint
CREATE INDEX "workflow_instance_idx_scope_status" ON "workflow-instances" USING btree ("tenantId","scopeId","status");--> statement-breakpoint
CREATE INDEX "workflow_instance_idx_subject" ON "workflow-instances" USING btree ("tenantId","subjectType","subjectId");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_step_run_unique_sequence" ON "workflow-step-runs" USING btree ("tenantId","workflowId","sequence");--> statement-breakpoint
CREATE INDEX "workflow_step_run_idx_scope" ON "workflow-step-runs" USING btree ("tenantId","scopeId");--> statement-breakpoint
CREATE INDEX "workflow_step_run_idx_workflow_step" ON "workflow-step-runs" USING btree ("tenantId","workflowId","stepId");--> statement-breakpoint
CREATE INDEX "workflow_step_run_idx_instance" ON "workflow-step-runs" USING btree ("tenantId","workflowInstanceId");--> statement-breakpoint
CREATE INDEX "workflow_step_run_idx_agent_run" ON "workflow-step-runs" USING btree ("tenantId","agentRunId");--> statement-breakpoint
CREATE INDEX "workflow_step_run_idx_child_workflow" ON "workflow-step-runs" USING btree ("tenantId","childWorkflowId");