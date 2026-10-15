# Hibiki: Client

The frontend for [Hibiki](../README.md): a Next.js 16 (App Router) app that renders the chat UI, keeps all client state in a Zustand store, and talks to the backend through same-origin route handlers plus a direct Socket.IO connection.

- **Production:** https://hibiki.mrsdev.in
- **API reference:** [docs/API.md](../docs/API.md) (see the *Next.js proxy map*)
- **Architecture:** [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

---

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, `output: 'standalone'`), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui primitives on Radix, a custom pixel-art kit (Pixelact UI), `next-themes` for light and dark |
| State | Zustand with Immer, split into slices |
| Real-time | `socket.io-client` |
| Auth | `@supabase/ssr` (cookie sessions) and `@supabase/supabase-js` |
| Forms and validation | React Hook Form with Zod |
| Media | `react-easy-crop` (avatar cropping), `pdfjs-dist` (PDF thumbnails), `media-chrome` (audio and video), `yet-another-react-lightbox` (image viewer) |

## Project structure

```
client/
├── proxy.ts                      # Next 16 "proxy" (formerly middleware): refreshes the Supabase session, redirects to /login
├── next.config.ts                # standalone output, Cloudinary image host, 25 MB proxy body limit
├── app/
│   ├── layout.tsx                # Root layout: fonts, theme, toaster
│   ├── (auth)/login, register    # Public pages
│   ├── (app)/page.tsx            # The chat app. Server component: loads the profile, then renders <AppBootstrap>
│   └── api/                      # Route handlers: cookie session → Bearer token → backend (see docs/API.md)
│       ├── rooms, messages
│       ├── rooms/[roomId]/messages
│       ├── personal/me
│       ├── friendships/{search,pending,request,accept,reject}
│       └── groups/…              # create, search, [roomId], invites, participants, invites/{pending,accept,reject}
├── store/
│   ├── chatStore.ts              # Composes every slice into one store
│   ├── selectors.ts
│   └── slices/
│       ├── createAuthSlice.ts        # currentUser
│       ├── createUiSlice.ts          # view mode, selected room, panels
│       ├── createRoomSlice.ts        # rooms (direct and group), ordering
│       ├── createMessageSlice.ts     # per-room messages, cursor pagination, optimistic send
│       ├── createFriendshipSlice.ts  # search, pending requests, accept/reject
│       ├── createGroupSlice.ts       # group create/edit/invite/roles
│       ├── createSocketSlice.ts      # socket lifecycle and every event listener
│       └── createComposerSlice.ts    # files staged before sending
├── features/chat/                # Feature UI, grouped by area
│   ├── AppBootStrap.tsx          # Boot sequence (see below)
│   ├── layout/                   # ChatLayout, ViewListContainer, LoadingScreen, ViewportHeightSync
│   ├── sidebar/                  # Icon sidebar, theme toggle
│   ├── rooms/                    # Room list
│   ├── RoomView/                 # Direct and group room views
│   ├── ui/                       # ChatArea, TopBar, MessageArea, MessageBubble, ChatInput, AttachmentPreview, …
│   ├── messages/                 # Renderers per attachment type: image, video, audio, pdf, generic file
│   ├── groups/                   # Create, edit, add participant, invite dialogs
│   ├── requests/                 # Friend search and pending requests
│   └── userpanel/                # Profile settings
├── components/
│   ├── auth/                     # Login and register forms, verify-email toast
│   └── ui/                       # shadcn components, and pixelact-ui/ (pixel-art variants)
├── lib/
│   ├── supabase/{client,server,proxy}.ts   # Browser client, server client, session refresh helper
│   ├── types.ts                  # Shared types (Profile, rooms, messages, attachments)
│   ├── backend.ts                # forwardedForHeader(): passes the browser's IP to the backend for rate limiting
│   ├── attachments.ts            # Client-side limits and formatting
│   ├── cropImage.ts, pdf.ts      # Avatar cropping, PDF thumbnail helper
│   └── utils.ts
├── providers/                    # theme-provider, toast-provider
└── server/actions/auth/register.ts  # Server action: validates and calls supabase.auth.signUp
```

## How it works

### Boot sequence

`app/(app)/page.tsx` runs on the server: it reads the Supabase session cookie and fetches `/api/personal/me` from the backend, then hands the profile to `<AppBootstrap>`. On the client, `AppBootstrap` runs once:

1. Fetch rooms, pending friend requests and pending group invites in parallel.
2. Preload the most recent page of messages for every room.
3. **Then** connect the Socket.IO client with the access token and send one `rooms:joinMany`.
4. Hide the loading screen.

Connecting last means the app never renders half-populated, and live events always land on a store that is already loaded.

### Auth

Supabase email and password auth. Registration is a server action (`register.ts`) that validates input with Zod, checks that the username is free, and calls `signUp` with `username` and `full_name` in the metadata. A database trigger turns that into a `profiles` row. Login uses the browser Supabase client. `proxy.ts` runs on every request, refreshes the session, and redirects anonymous visitors to `/login`.

### Two ways to reach the backend

- **REST:** the browser calls same-origin `/api/*`. Route handlers read the session cookie, extract the access token, and forward the request to `BACKEND_BASE_URL` with `Authorization: Bearer …`. Multipart uploads are passed through as `FormData` so files stay real Blobs. Each call also forwards `X-Forwarded-For` (set by Traefik) via `lib/backend.ts`, so the backend rate-limits by the real client instead of treating every user as this one server.
- **Socket.IO:** the browser connects **directly** to `NEXT_PUBLIC_BACKEND_URL`, passing the access token in the handshake. A WebSocket cannot go through a route handler.

### Messaging

- **Optimistic send.** A message is added to the store immediately with an id like `temp-<uuid>` and status `pending`. When the server echoes `message:new` with the same `clientTempId`, the temporary entry is replaced by the real message (`sent`). On `message:error` or a failed upload it becomes `failed`.
- **Text** goes over the socket (`message:send`). **Attachments** go over REST as multipart, and the server broadcasts the result over the socket.
- **History** is paginated with a cursor: `GET /api/messages?roomId=…&limit=50&before=<created_at of oldest loaded>`. Scrolling to the top loads the next page. The slice reverses the newest-first response for display.
- **Status icons** on your own messages: clock for *pending*, one check for *sent*, and a warning state for *failed*. There are no delivery or read receipts.

### Why one store

All state lives in `useChatStore`, and components call store actions rather than touching the socket. That keeps every server event (friend request, invite, group edit, new message) funnelled through one place that mutates one source of truth. `selectedRoomId` is stored instead of a room object, and the room is derived with a selector, so the selected room can never drift out of sync with the room list.

## Environment variables

Create `client/.env.local` (git-ignored):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-host
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
BACKEND_BASE_URL=http://localhost:5000
```

| Variable | Read at | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **build time** | Supabase API URL. Production: `https://supabase.mrsdev.in`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **build time** | Supabase publishable (anon) key. Public by design. |
| `NEXT_PUBLIC_BACKEND_URL` | **build time** | Backend URL **for the browser**: the Socket.IO target. Production: `https://backend-hibiki.mrsdev.in`. |
| `BACKEND_BASE_URL` | runtime, server only | Backend URL **for Next.js server code**: where `/api/*` handlers and the home page send requests. In Kubernetes: `http://hibiki-server:5000`. Never sent to the browser. |

`NEXT_PUBLIC_*` values are inlined into the JavaScript bundle by `next build`, so changing them requires a rebuild. In production they are passed as Docker build args by [`.github/workflows/build-client.yml`](../.github/workflows/build-client.yml).

## Running locally

```bash
npm install
npm run dev       # http://localhost:3000
```

Run the [server](../server/README.md) on port 5000 first, since chat features need it.

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (standalone output) |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |

## Docker

```bash
docker build -t hibiki-client \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-host \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
  --build-arg NEXT_PUBLIC_BACKEND_URL=http://localhost:5000 \
  ./client
docker run --rm -p 3000:3000 --add-host=host.docker.internal:host-gateway \
  -e BACKEND_BASE_URL=http://host.docker.internal:5000 hibiki-client
```

The runtime stage copies only the Next.js standalone output, static assets and `public/`, and runs `node server.js` as the unprivileged `node` user.

## Deployment

The client runs as a container on the project's own k3s cluster, built and rolled out automatically on every push to `main` that touches `client/`. See [Deployment](../docs/DEPLOYMENT.md).
