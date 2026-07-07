FROM node:22-bookworm-slim as base

WORKDIR /client/

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /client/

ENV NODE_ENV=production
COPY --from=base /client/.next/standalone ./
COPY --from=base /client/.next/static ./.next/static
COPY --from=base /client/public ./public

USER node
EXPOSE 3000
CMD [ "node", "server.js" ]
