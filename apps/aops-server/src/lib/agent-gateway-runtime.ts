import { createAgentGateway } from '$lib/agent-gateway';
import { resetManifestModuleImportCache } from '$lib/agent-gateway/catalog';
import { getHostConfig } from '$lib/host-config';
import { getHostPluginRegistry, resetHostPluginRegistry } from '$lib/host-plugins/registry';

let singleton: ReturnType<typeof createAgentGateway> | null = null;

export function getAgentGateway() {
	if (singleton) return singleton;
	const config = getHostConfig();
	singleton = createAgentGateway({
		registryResolver: getHostPluginRegistry,
		registryResetter: resetHostPluginRegistry,
		config: config.agentGateway
	});
	return singleton;
}

export function resetAgentGateway(): void {
	singleton = null;
	resetManifestModuleImportCache();
}

export function getAgentGatewayDiagnostics() {
	return (
		singleton?.getDiagnostics() ?? {
			enabled: getHostConfig().agentGateway?.enabled !== false,
			snapshotLoaded: false,
			toolCount: 0,
			errorCount: 0
		}
	);
}
