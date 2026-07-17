FROM node:24.14.1-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:4000/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --concurrency=2

FROM node:24.14.1-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app
COPY --from=build --chown=node:node /app /app

USER node

EXPOSE 3000 4000 4001
