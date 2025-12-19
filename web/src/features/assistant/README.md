# Assistant Feature

## Overview

Interactive chat assistant feature that allows users to have conversations with an LLM-powered assistant, with full Langfuse tracing integration.

## Backend Implementation

### Database Models

- **Conversation**: Stores conversation metadata
  - Fields: `id`, `projectId`, `userId`, `startedAt`
  - Indexes: `(projectId, startedAt desc)`, `(userId, startedAt desc)`

- **Message**: Stores individual messages in conversations
  - Fields: `id`, `conversationId`, `sender` (USER | ASSISTANT), `content`, `timestamp`
  - Index: `(conversationId, timestamp asc)`

### API Endpoints (Worker)

Located in `worker/src/features/assistant/controllers/assistant.ts`:

- `GET /api/conversations` - List conversations (query: `projectId`, optional `userId`)
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations` - Create new conversation (body: `projectId`, `userId`)
- `POST /api/conversations/:id/messages` - Add message and get assistant response (body: `content`)

### LLM Integration

- Fetches OpenAI API key from `LLMApiKeys` table (project-scoped)
- Decrypts API key and initializes OpenAI client
- Sends conversation history + new user message to `gpt-4o-mini`
- Saves both user and assistant messages to database
- Creates Langfuse traces via `processEventBatch` for observability

### Langfuse Tracing

Each assistant call creates:
- `TRACE_CREATE` event with conversation context
- `GENERATION_CREATE` event with LLM input/output, usage, and metadata

## Frontend Implementation

### Components

- **ConversationListSidebar** (`components/ConversationListSidebar.tsx`)
  - Lists conversations using `useConversations` hook
  - "New Conversation" button creates and selects conversation
  - Displays relative timestamps

- **ChatView** (`components/ChatView.tsx`)
  - Displays messages with user/assistant distinction
  - Input box with Enter to send, Shift+Enter for newline
  - Auto-focus, auto-scroll, loading states
  - Relative timestamps on messages

### React Query Hooks

- `useConversations` - Fetch conversations list
- `useConversation` - Fetch single conversation with messages
- `useCreateConversation` - Create new conversation mutation
- `useAddMessage` - Send message mutation

### API Proxy Routes

Next.js API routes in `web/src/pages/api/assistant/`:
- Proxy requests to worker API with robust error handling
- Handle `ECONNREFUSED` errors gracefully
- 10-second timeout with user-friendly error messages

## Architecture

```
Browser → Next.js API Route → Worker Express API → OpenAI
                ↓
         React Query Cache
```

- Next.js routes handle authentication and proxy to worker
- Worker handles business logic, database, and LLM calls
- React Query provides caching and optimistic updates

## Testing

- Backend tests: `worker/src/features/assistant/__tests__/assistant.test.ts`
  - Run command: `pnpm --filter=web test assistant.clienttest`
- Frontend tests: `web/src/features/assistant/components/assistant.clienttest.tsx`
  - Run command: `pnpm --filter=web test-client --testPathPattern=assistant.clienttest`

## API Specification

Fern API definition: `fern/apis/server/definition/assistant.yml`
- OpenAPI spec generated automatically in CI
- All endpoints documented with request/response types

## Running Locally

1. **Environment variables** (`.env` file):
   ```env
   CLICKHOUSE_CLUSTER_ENABLED=false
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_BASE_URL=http://localhost:3000
   WORKER_API_URL=http://localhost:3030
   NEXT_PUBLIC_WORKER_API_URL=http://localhost:3030
   ```

2. **Start infrastructure**: `pnpm run infra:dev:up` (PostgreSQL, ClickHouse, Redis, MinIO)

3. **Run database migrations**:
   ```bash
   pnpm --filter=shared run db:migrate  # PostgreSQL migrations
   pnpm --filter=shared run ch:reset   # ClickHouse migrations (required to see traces)
   ```

4. **Start worker server**: `pnpm run dev:worker` (runs on `http://localhost:3030`)

5. **Start web server**: `pnpm run dev` or `pnpm run dev:web` (runs on `http://localhost:3000`)

6. **Configure OpenAI API key**:
   - Navigate to project settings → LLM API Keys
   - Add OpenAI API key (required for assistant to generate responses)

7. **Access assistant**: Navigate to `/project/[projectId]/assistant`

**Note**: Both worker and web servers must be running. The web server proxies requests to the worker API. If the worker is not running, you'll see a helpful error message. ClickHouse migrations are required to view traces in the Langfuse UI.

## Decisions & Trade-offs

### Architecture Decisions

- **Custom React Query hooks vs tRPC**: Used custom hooks because endpoints are in the worker (Express), not Next.js tRPC layer. This keeps the architecture simple while still providing React Query benefits (caching, refetching).

- **Next.js API proxy**: Proxies requests from browser to worker to handle CORS and provide unified authentication. Adds one network hop but simplifies frontend code.

- **Blocking LLM calls**: Current implementation waits for full LLM response before returning. Trade-off: simpler implementation vs. better UX with streaming.

### Current Limitations

- **No pagination**: Conversations and messages load entirely. Fine for small datasets, but will need pagination at scale.

- **No message history limit**: Sends entire conversation history to LLM. Can cause high token costs for long conversations.

- **No rate limiting**: No protection against API abuse or cost explosion.

- **No streaming**: Users wait for complete LLM response instead of seeing tokens stream in.

### Future Improvements

- **High Priority**:
  - Add pagination to conversations list and messages
  - Limit message history sent to LLM (sliding window, token budget)
  - Implement optimistic updates in frontend
  - Add rate limiting middleware

- **Medium Priority**:
  - Streaming LLM responses (Server-Sent Events)
  - Virtual scrolling for long message lists
  - Cache decrypted API keys
  - Message pagination/lazy loading

- **Nice to Have**:
  - Memoize timestamp formatting
  - Smart auto-scroll (only when user is at bottom)
  - Connection pooling configuration

See `PERFORMANCE_ANALYSIS.md` for detailed performance analysis and optimization recommendations.
