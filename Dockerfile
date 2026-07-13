# syntax=docker/dockerfile:1.7
ARG SOURCE_DATE_EPOCH=0

FROM ghcr.io/aopslab/aops-community-base-node-build:22-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365 AS build

WORKDIR /workspace
ARG SOURCE_DATE_EPOCH
ARG TARGETARCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
RUN corepack enable && corepack install --global pnpm@11.9.0
COPY . .
RUN pnpm --version | grep -Fx '11.9.0'
RUN pnpm install --frozen-lockfile
RUN pnpm typecheck
RUN pnpm build
RUN pnpm --config.forceLegacyDeploy=false --config.injectWorkspacePackages=true --filter @aops/aops-server deploy --prod /runtime/apps/aops-server
RUN pnpm --config.forceLegacyDeploy=false --config.injectWorkspacePackages=true --ignore-scripts --filter @aops/aops-cli deploy --prod /runtime/apps/aops-cli
RUN mkdir -p /tmp/community-product-payload &&   node scripts/community-export/community-runtime-deploy-inventory-cli.mjs     --tree-root /workspace     --deploy-root /runtime/apps/aops-server     --lockfile /workspace/pnpm-lock.yaml     --importer-key apps/aops-server     --platform "linux/${TARGETARCH}"     --surface server-prod-deploy     > /tmp/community-product-payload/server.json &&   node scripts/community-export/community-runtime-deploy-inventory-cli.mjs     --tree-root /workspace     --deploy-root /runtime/apps/aops-cli     --lockfile /workspace/pnpm-lock.yaml     --importer-key apps/aops-cli     --platform "linux/${TARGETARCH}"     --surface image-cli-prod-deploy     > /tmp/community-product-payload/cli.json &&   node scripts/community-export/community-product-payload-gate.mjs     --lockfile /workspace/pnpm-lock.yaml     --product-inventory /workspace/THIRD_PARTY_NOTICES.inventory.json     --runtime-inventory /tmp/community-product-payload/server.json     --runtime-inventory /tmp/community-product-payload/cli.json     --cockpit-inventory /workspace/apps/aops-cockpit-v2/dist/community.module-inventory.json     --platform "linux/${TARGETARCH}"     > /tmp/community-product-payload/proof.json &&   test -s /tmp/community-product-payload/proof.json
RUN rm -rf   /runtime/apps/aops-server/src   /runtime/apps/aops-server/.svelte-kit   /runtime/apps/aops-server/svelte.config.js   /runtime/apps/aops-server/tsconfig.json   /runtime/apps/aops-server/vite.config.ts   /runtime/apps/aops-cli/src   /runtime/apps/aops-cli/tsconfig.json
RUN test -f /runtime/apps/aops-cli/dist/main.js &&   node /runtime/apps/aops-cli/dist/main.js --help | grep -Eq '^Usage: aops-cli'
RUN mkdir -p /runtime/apps/aops-cockpit-v2 /runtime/deploy &&   cp -a apps/aops-cockpit-v2/dist /runtime/apps/aops-cockpit-v2/dist &&   cp -a deploy/community /runtime/deploy/community
RUN cp LICENSE NOTICE THIRD_PARTY_NOTICES THIRD_PARTY_NOTICES.inventory.json /runtime/ &&   test -s /runtime/LICENSE &&   test -s /runtime/NOTICE &&   test -s /runtime/THIRD_PARTY_NOTICES &&   test -s /runtime/THIRD_PARTY_NOTICES.inventory.json
RUN find /runtime -type f -name '*.map' -delete

FROM ghcr.io/aopslab/aops-community-base-node-runtime:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS runtime

LABEL org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production
WORKDIR /workspace
RUN rm -rf /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /runtime/ /workspace/
USER node
EXPOSE 5900
CMD ["node", "deploy/community/start.mjs"]
