FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS toolchain
RUN apk add --no-cache --upgrade libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 zlib=1.4-r0
COPY scripts/npm-toolchain /tmp/hyperhive-bootstrap
RUN sh /tmp/hyperhive-bootstrap/install.sh /opt && rm -rf /tmp/hyperhive-bootstrap /usr/local/lib/node_modules/npm && \
    ln -sf /opt/hyperhive-npm/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf /opt/hyperhive-npm/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

FROM toolchain AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --min-release-age=3
COPY apps ./apps
COPY packages ./packages
COPY contracts/src ./contracts/src
COPY scripts ./scripts
COPY tsconfig.json vite.config.ts ./
COPY deploy/compose.app.yaml deploy/compose.signer.yaml ./deploy/
RUN npm run build && npm run contracts:build && npm prune --omit=dev --omit=peer --ignore-scripts --no-audit
# Optional TypeScript tooling has no runtime role in the transpile-only loader.
RUN rm -rf node_modules/typescript node_modules/@typescript node_modules/.bin/tsc node_modules/.bin/tsserver

FROM toolchain AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/contracts/out ./contracts/out
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/deploy ./deploy
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 8788
CMD ["npm", "start"]
