FROM node:20-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN npm ci --workspace @fixit/api

COPY apps/api ./apps/api

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace", "@fixit/api"]