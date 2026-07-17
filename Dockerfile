# syntax=docker/dockerfile:1.7
ARG SOURCE_DATE_EPOCH=0

FROM --platform=$TARGETPLATFORM ghcr.io/eeemzs/aops-community-base-node-build:22-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365 AS build-base

WORKDIR /workspace
ARG SOURCE_DATE_EPOCH
ARG TARGETOS
ARG TARGETARCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
RUN test "${TARGETOS}" = linux &&   case "${TARGETARCH}" in amd64) EXPECTED_ARCH=x64 ;; arm64) EXPECTED_ARCH=arm64 ;; *) exit 1 ;; esac &&   EXPECTED_ARCH="${EXPECTED_ARCH}" node -e 'if (process.platform !== "linux" || process.arch !== process.env.EXPECTED_ARCH) process.exit(1)'
RUN corepack enable && corepack install --global pnpm@11.9.0
COPY . .
RUN pnpm --version | grep -Fx '11.9.0'
RUN pnpm install --frozen-lockfile
RUN pnpm verify
RUN pnpm --config.forceLegacyDeploy=false --config.injectWorkspacePackages=true --filter @aops/aops-server deploy --prod /runtime/apps/aops-server
RUN pnpm --config.forceLegacyDeploy=false --config.injectWorkspacePackages=true --ignore-scripts --filter @aops/aops-cli deploy --prod /cli-artifact/apps/aops-cli
RUN mkdir -p /runtime/apps/aops/packages/aops-pg-bootstrap/drizzle-out /runtime/domains/chatv3/drizzle-out /runtime/domains/docman/drizzle-out /runtime/domains/projectman/drizzle-out /runtime/domains/sys/drizzle-out
RUN cp -a apps/aops/packages/aops-pg-bootstrap/drizzle-out/agentspace-community /runtime/apps/aops/packages/aops-pg-bootstrap/drizzle-out/agentspace-community && \
    cp -a domains/chatv3/drizzle-out/chatv3 /runtime/domains/chatv3/drizzle-out/chatv3 && \
    cp -a domains/docman/drizzle-out/docman /runtime/domains/docman/drizzle-out/docman && \
    cp -a domains/projectman/drizzle-out/projectman /runtime/domains/projectman/drizzle-out/projectman && \
    cp -a domains/sys/drizzle-out/sys /runtime/domains/sys/drizzle-out/sys
RUN test -f /runtime/apps/aops/packages/aops-pg-bootstrap/drizzle-out/agentspace-community/meta/_journal.json && \
    test -f /runtime/domains/chatv3/drizzle-out/chatv3/meta/_journal.json && \
    test -f /runtime/domains/docman/drizzle-out/docman/meta/_journal.json && \
    test -f /runtime/domains/projectman/drizzle-out/projectman/meta/_journal.json && \
    test -f /runtime/domains/sys/drizzle-out/sys/meta/_journal.json
RUN mkdir -p /community-product-evidence &&   node scripts/community-export/community-runtime-deploy-inventory-cli.mjs     --tree-root /workspace     --deploy-root /runtime/apps/aops-server     --lockfile /workspace/pnpm-lock.yaml     --importer-key apps/aops-server     --platform "linux/${TARGETARCH}"     --surface server-prod-deploy     > /community-product-evidence/server.json &&   node scripts/community-export/community-runtime-deploy-inventory-cli.mjs     --tree-root /workspace     --deploy-root /cli-artifact/apps/aops-cli     --lockfile /workspace/pnpm-lock.yaml     --importer-key apps/aops-cli     --platform "linux/${TARGETARCH}"     --surface cli-artifact-prod-deploy     > /community-product-evidence/cli.json &&   cp apps/aops-cockpit-v2/dist/community.module-inventory.json /community-product-evidence/community.module-inventory.json

FROM scratch AS community-product-evidence
COPY --from=build-base /community-product-evidence/ /

FROM build-base AS build
ARG TARGETARCH
RUN node scripts/community-export/community-product-payload-gate.mjs     --lockfile /workspace/pnpm-lock.yaml     --product-inventory /workspace/THIRD_PARTY_NOTICES.inventory.json     --runtime-inventory /community-product-evidence/server.json     --runtime-inventory /community-product-evidence/cli.json     --cockpit-inventory /community-product-evidence/community.module-inventory.json     --platform "linux/${TARGETARCH}"     > /community-product-evidence/proof.json &&   test -s /community-product-evidence/proof.json
RUN rm -rf   /runtime/apps/aops-server/src   /runtime/apps/aops-server/.svelte-kit   /runtime/apps/aops-server/svelte.config.js   /runtime/apps/aops-server/tsconfig.json   /runtime/apps/aops-server/vite.config.ts   /cli-artifact/apps/aops-cli/src   /cli-artifact/apps/aops-cli/tsconfig.json
RUN test -f /cli-artifact/apps/aops-cli/dist/main.js &&   node /cli-artifact/apps/aops-cli/dist/main.js --help | grep -Eq '^Usage: aops-cli' &&   test ! -e /runtime/apps/aops-cli
RUN mkdir -p /runtime/apps/aops-cockpit-v2 /runtime/deploy &&   cp -a apps/aops-cockpit-v2/dist /runtime/apps/aops-cockpit-v2/dist &&   cp -a deploy/community /runtime/deploy/community
RUN cp LICENSE NOTICE THIRD_PARTY_NOTICES THIRD_PARTY_NOTICES.inventory.json /runtime/ &&   test -s /runtime/LICENSE &&   test -s /runtime/NOTICE &&   test -s /runtime/THIRD_PARTY_NOTICES &&   test -s /runtime/THIRD_PARTY_NOTICES.inventory.json
RUN find /runtime -type f -name '*.map' -delete

FROM ghcr.io/eeemzs/aops-community-base-node-runtime:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS runtime

LABEL org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production
WORKDIR /workspace
RUN rm -rf /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /runtime/ /workspace/
RUN test ! -e /workspace/apps/aops-cli
USER node
EXPOSE 5900
CMD ["node", "deploy/community/start.mjs"]
