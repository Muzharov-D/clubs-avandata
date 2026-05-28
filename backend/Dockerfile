# =============================================================================
# Multi-runtime image: Node 22 (backend) + Python 3.11 (SportVisor parsers)
# Render Web Service deploys this via Docker (auto-detected if Dockerfile в repo root).
# =============================================================================

FROM node:22-bookworm-slim

# Python + system deps for pdfplumber/Pillow.
# pdfplumber требует libgl/libglib для возможной работы с изображениями.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      libjpeg-dev zlib1g-dev libpng-dev \
      && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python venv (изолируем от system Python чтобы pip install не тянулся в /usr)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Python parser deps первыми — для кеша слоёв
COPY parsers/requirements.txt ./parsers/requirements.txt
RUN pip install --no-cache-dir -r parsers/requirements.txt

# Node deps
COPY package*.json ./
COPY .npmrc ./
RUN npm install --include=dev

# App source
COPY . .

# TS build
RUN npm run build

# Production deps only (slim image)
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

# Migrations runner — выполняется при старте.
# Render не имеет отдельного hook'а на free-tier — кладём в start command.
CMD ["sh", "-c", "npm run db:migrate && node dist/server.js"]
