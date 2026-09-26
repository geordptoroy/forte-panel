FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN useradd --system --uid 10001 --create-home forte && mkdir -p /app/sessions && chown -R forte:forte /app
USER forte
EXPOSE 3010
CMD ["node", "dist/index.js"]
