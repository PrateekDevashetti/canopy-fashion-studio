# Fashion Studio generation worker (Railway). The web app deploys to Vercel and ignores this file.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN npm ci --include=dev --workspace @fashion/worker --workspace @fashion/core --include-workspace-root

COPY packages ./packages
COPY apps/worker ./apps/worker

EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@fashion/worker"]
