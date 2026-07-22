# ---- Stage 1: build ----
# Full toolchain here: dev deps + TypeScript compiler. None of this ships to prod.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifest + lockfile FIRST, install, THEN copy source.
# This lets Docker cache the (slow) install layer so editing source
# doesn't re-run npm ci. `npm ci` installs exactly what the lockfile pins.
COPY package.json package-lock.json ./
RUN npm ci

# Now the source. Compile TS -> JS into ./dist (tsconfig has no outDir, so pass it).
COPY . .
RUN npx tsc --outDir dist

# ---- Stage 2: runtime ----
# Lean image: production deps only + the compiled JS. No tsx, no compiler, no source.
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Reinstall deps with dev deps omitted. Running npm ci fresh here (not copying
# node_modules from the build stage) is also what keeps sharp's NATIVE binary
# correct: it's fetched for THIS stage's platform. Never cross-copy node_modules
# between architectures.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy only the build artifact out of the build stage.
COPY --from=build /app/dist ./dist

# Drop root. The official node image ships an unprivileged `node` user (uid 1000).
USER node

# Documentation for humans/tooling; index.ts defaults PORT to 5000.
EXPOSE 5000

CMD ["node", "dist/index.js"]
