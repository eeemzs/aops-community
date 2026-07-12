# syntax=docker/dockerfile:1.7
ARG SOURCE_DATE_EPOCH=0

FROM ghcr.io/aopslab/aops-community-base-node-build:22-bookworm@sha256:a25c9934ff6382cd4f08b6bc26c82bf4ea69b1e6f8dabfb2ead457374127c365 AS build

WORKDIR /workspace
ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
RUN corepack enable && corepack install --global pnpm@11.9.0
COPY . .
RUN pnpm --version | grep -Fx '11.9.0'
RUN pnpm install --frozen-lockfile
RUN pnpm typecheck
RUN pnpm build
RUN pnpm --filter @aops/aops-server deploy --prod /runtime/apps/aops-server
RUN pnpm --ignore-scripts --filter @aops/aops-cli deploy --prod /runtime/apps/aops-cli
RUN rm -rf   /runtime/apps/aops-server/src   /runtime/apps/aops-server/.svelte-kit   /runtime/apps/aops-server/svelte.config.js   /runtime/apps/aops-server/tsconfig.json   /runtime/apps/aops-server/vite.config.ts   /runtime/apps/aops-cli/src   /runtime/apps/aops-cli/tsconfig.json
RUN test -f /runtime/apps/aops-cli/dist/main.js &&   node /runtime/apps/aops-cli/dist/main.js --help | grep -Eq '^Usage: aops-cli'
RUN mkdir -p /runtime/apps/aops-cockpit-v2 /runtime/deploy &&   cp -a apps/aops-cockpit-v2/dist /runtime/apps/aops-cockpit-v2/dist &&   cp -a deploy/community /runtime/deploy/community
RUN find /runtime -type f -name '*.map' -delete

FROM ghcr.io/aopslab/aops-community-base-node-runtime:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS runtime

ENV NODE_ENV=production
WORKDIR /workspace
RUN rm -rf /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /runtime/ /workspace/
USER node
EXPOSE 5900
CMD ["node", "deploy/community/start.mjs"]
