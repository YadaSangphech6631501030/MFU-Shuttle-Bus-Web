FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

ARG INSTALL_DETECTOR=true

RUN apt-get update \
  && if [ "$INSTALL_DETECTOR" = "true" ]; then \
    apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      python3 \
      python3-pip \
      python3-venv; \
    else \
      apt-get install -y --no-install-recommends ca-certificates; \
    fi \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY python/requirements.txt ./python/requirements.txt
RUN if [ "$INSTALL_DETECTOR" = "true" ]; then \
    python3 -m venv /opt/venv \
      && /opt/venv/bin/pip install --upgrade pip \
      && /opt/venv/bin/pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
      && /opt/venv/bin/pip install --no-cache-dir -r ./python/requirements.txt \
      && /opt/venv/bin/pip install --no-cache-dir --no-deps ultralytics==8.4.78; \
    fi

ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHON_BIN=/opt/venv/bin/python
ENV DETECTOR_ENABLED=${INSTALL_DETECTOR}

COPY . .

RUN mkdir -p runtime/frames \
  && chown -R node:node /app

USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5001) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "app.js"]
