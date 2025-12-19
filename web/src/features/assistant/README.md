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
- Frontend tests: `web/src/features/assistant/components/assistant.clienttest.tsx`

## API Specification

Fern API definition: `fern/apis/server/definition/assistant.yml`
- OpenAPI spec generated automatically in CI
- All endpoints documented with request/response types
