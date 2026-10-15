# The portfolio site and its contact-form API in one image.
#
# Builds and runs unchanged on Render, Railway, Fly.io, or any host that takes
# a Dockerfile. See the readme for the environment variables it needs.

FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install dependencies first, on their own layer, so a change to the site does
# not re-install them. `npm ci` installs exactly what package-lock.json pins.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The server, then the pages it serves.
COPY server ./server
COPY *.html *.css *.js *.svg ./
COPY assets ./assets

# The host usually sets PORT itself; this is the fallback (server/config.js
# reads process.env.PORT).
ENV PORT=3000
EXPOSE 3000

# Run as the unprivileged user the base image already provides.
USER node

CMD ["node", "server/index.js"]
