FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM node:20-slim

RUN npm install -g serve

COPY --from=build /app/dist /app/dist

CMD ["serve", "-s", "/app/dist", "-l", "3000"]
