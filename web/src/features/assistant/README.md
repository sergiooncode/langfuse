# Assistant Feature

## Overview

Interactive chat assistant feature that allows users to have conversations with an LLM-powered assistant, with full Langfuse tracing integration.

## Table of Contents

### README Sections

- [Overview](#overview)
- [Backend Implementation](#backend-implementation)
  - [Database Models](#database-models)
  - [API Endpoints (Worker)](#api-endpoints-worker)
  - [LLM Integration](#llm-integration)
  - [Langfuse Tracing](#langfuse-tracing)
- [Frontend Implementation](#frontend-implementation)
  - [Components](#components)
  - [React Query Hooks](#react-query-hooks)
  - [API Proxy Routes](#api-proxy-routes)
- [Architecture](#architecture)
- [Tracing & Observability](#tracing--observability)
  - [Trace Structure](#trace-structure)
  - [Viewing Traces](#viewing-traces)
  - [Trace Implementation](#trace-implementation)
  - [Non-Blocking Tracing](#non-blocking-tracing)
  - [Benefits](#benefits)
- [Testing](#testing)
  - [Test Structure](#test-structure)
  - [Testing Strategy](#testing-strategy)
  - [Challenges Encountered](#challenges-encountered)
  - [Best Practices Applied](#best-practices-applied)
  - [Running Tests](#running-tests)
- [API Specification](#api-specification)
- [Running Locally](#running-locally)
- [Key Design Decisions & Rationale](#key-design-decisions--rationale)
- [Error Handling & Edge-Case Considerations](#error-handling--edge-case-considerations)
  - [Backend Error Handling](#backend-error-handling)
  - [Frontend Error Handling](#frontend-error-handling)
  - [Edge Cases Handled](#edge-cases-handled)
  - [Error Recovery Strategies](#error-recovery-strategies)
- [Decisions & Trade-offs](#decisions--trade-offs)
  - [Architecture Decisions](#architecture-decisions)
  - [Current Limitations](#current-limitations)
  - [Future Improvements](#future-improvements)

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

## Tracing & Observability

Every assistant conversation interaction is automatically traced in Langfuse, providing full observability into LLM calls, costs, and performance.

### Trace Structure

Each message sent to the assistant creates:

1. **TRACE_CREATE Event** - Top-level trace representing the conversation interaction
   - **Name**: `Assistant Conversation: {conversationId}`
   - **Input**: Full conversation history and new user message
   - **Output**: Assistant's response
   - **Metadata**: `conversationId`, `model` (gpt-4o-mini)
   - **User ID**: Links trace to the user who initiated the conversation

2. **GENERATION_CREATE Event** - Detailed LLM generation information
   - **Name**: "OpenAI Chat Completion"
   - **Model**: `gpt-4o-mini`
   - **Input**: Full message history in OpenAI format
   - **Output**: Assistant's response content
   - **Usage**: Token counts (input, output, total)
   - **Timing**: `startTime`, `endTime`, `completionStartTime`
   - **Model Parameters**: `temperature: 0.7`, `max_tokens: 1000`
   - **Metadata**: `conversationId`, `messageId`

### Viewing Traces

After sending a message in the assistant:

1. Navigate to the **Traces** page in Langfuse
2. Search for traces with name pattern: `Assistant Conversation: *`
3. Click on a trace to view:
   - Full conversation context
   - LLM input/output
   - Token usage and costs
   - Model parameters
   - Timing information
   - Metadata linking back to conversation and message IDs

![Assistant conversation trace in Langfuse UI](./images/tracing-screenshot.png)

### Trace Implementation

Traces are created using `processEventBatch` from `@langfuse/shared/src/server`:

```typescript
// In addMessageToConversation controller
const traceEvent: IngestionEventType = {
  type: eventTypes.TRACE_CREATE,
  body: {
    id: traceId,
    name: `Assistant Conversation: ${id}`,
    userId: conversation.userId,
    input: { conversationId: id, messages: openaiMessages },
    output: { assistantMessage: assistantContent },
    metadata: { conversationId: id, model: "gpt-4o-mini" },
  },
};

const generationEvent: IngestionEventType = {
  type: eventTypes.GENERATION_CREATE,
  body: {
    id: generationId,
    traceId: traceId,
    name: "OpenAI Chat Completion",
    model: "gpt-4o-mini",
    input: openaiMessages,
    output: assistantContent,
    usage: { input, output, total, unit: "TOKENS" },
    metadata: { conversationId: id, messageId: assistantMessage.id },
  },
};

await processEventBatch([traceEvent, generationEvent], {...});
```

### Non-Blocking Tracing

Tracing is **non-blocking** - if tracing fails, the conversation still succeeds:

- Errors are caught and logged
- User experience is not impacted
- Traces are created asynchronously
- Failures are monitored via logs

This ensures observability doesn't impact the critical path of user interactions.

### Benefits

- **Cost Monitoring**: Track token usage and costs per conversation
- **Performance Analysis**: Monitor LLM response times
- **Debugging**: Inspect full conversation context when issues occur
- **User Attribution**: Link traces to specific users via `userId`
- **Model Tracking**: See which model was used for each response
- **Full Context**: View complete conversation history in trace input

## Testing

### Test Structure

- **Backend tests**: `worker/src/features/assistant/__tests__/assistant.test.ts`
  - Run command: `pnpm --filter=worker test assistant.test`
  - Tests Express API endpoints with real database (Prisma)
  - Uses Vitest as the test framework

- **Frontend tests**: `web/src/features/assistant/components/assistant.clienttest.tsx`
  - Run command: `pnpm --filter=web test-client --testPathPattern=assistant.clienttest`
  - Tests React components with React Testing Library
  - Uses Jest as the test framework

### Testing Strategy

#### Backend Testing Approach

1. **Integration Testing**: Tests run against a real PostgreSQL database (via Prisma)
   - Each test creates isolated test data (project, user, conversations)
   - Uses `beforeEach`/`afterEach` for setup/teardown
   - Tests actual database operations, not mocks

2. **Mocking Strategy**:
   - **OpenAI Client**: Fully mocked to avoid real API calls and costs
   - **Langfuse Tracing**: `processEventBatch` is mocked to prevent tracing errors in tests
   - **Database**: Real Prisma client with test database

3. **Test Coverage**:
   - ✅ List conversations (with/without userId filter)
   - ✅ Get conversation by ID with messages
   - ✅ Create new conversation
   - ✅ Add message and receive assistant response
   - ✅ Error handling (missing conversation, invalid data)
   - ✅ Message ordering (chronological)
   - ✅ Project/user isolation

#### Frontend Testing Approach

1. **Component Testing**: Tests React components in isolation
   - Uses React Testing Library for user-centric testing
   - Mocks all external dependencies (hooks, router, auth)

2. **Mocking Strategy**:
   - **React Query Hooks**: Mocked to return controlled test data
   - **Next.js Router**: Mocked to prevent navigation errors
   - **Next-Auth**: Mocked session provider
   - **Browser APIs**: `window.matchMedia`, `Element.scrollIntoView` mocked

3. **Test Coverage**:
   - ✅ Starting a new conversation
   - ✅ Sending messages (click button, Enter key)
   - ✅ Shift+Enter for newlines
   - ✅ Disabled send button states
   - ✅ Message rendering (user vs assistant)
   - ✅ Timestamp display
   - ✅ Loading states
   - ✅ Empty states
   - ✅ Error states
   - ✅ Message ordering

### Challenges Encountered

#### Backend Testing Challenges

1. **Database Foreign Key Constraints**
   - **Issue**: Creating conversations failed with `conversations_user_id_fkey` constraint
   - **Solution**: Ensured `prisma.user.create` is called in `beforeEach` before creating conversations
   - **Lesson**: Always create dependent records (users) before dependent records (conversations)

2. **Missing Required Fields**
   - **Issue**: `PrismaClientValidationError: Argument 'displaySecretKey' is missing`
   - **Solution**: Added `displaySecretKey` field to `llmApiKeys.create` calls
   - **Lesson**: Check Prisma schema for all required fields, not just the ones you think you need

3. **OpenAI Mocking**
   - **Issue**: Needed to mock OpenAI client to avoid real API calls
   - **Solution**: Used Vitest's `vi.mock()` to replace the entire `openai` module
   - **Lesson**: Mock external services at the module level for integration tests

4. **Langfuse Tracing in Tests**
   - **Issue**: `processEventBatch` would fail or create noise in test output
   - **Solution**: Mocked `processEventBatch` to return a successful empty result
   - **Lesson**: Mock observability/tracing systems in tests unless specifically testing them

#### Frontend Testing Challenges

1. **Browser API Mocks**
   - **Issue**: `TypeError: window.matchMedia is not a function`
   - **Solution**: Added mock in `beforeEach`:
     ```typescript
     window.matchMedia = jest.fn().mockReturnValue({
       matches: false,
       addListener: jest.fn(),
       removeListener: jest.fn(),
     });
     ```
   - **Lesson**: Many UI libraries (like Radix UI) use `matchMedia` for responsive behavior

2. **Element.scrollIntoView Mock**
   - **Issue**: `TypeError: messagesEndRef.current?.scrollIntoView is not a function`
   - **Solution**: Added `Element.prototype.scrollIntoView = jest.fn();` mock
   - **Lesson**: React refs that call DOM methods need mocks in test environment

3. **React Testing Library Query Specificity**
   - **Issue**: `Found multiple elements with the text: /conversation/i`
   - **Solution**: Used more specific queries:
     - Changed from `getByText(/conversation/i)` to `getByText(/conv-1/i)`
     - Used `getAllByText("You")` for multiple instances
     - Used exact text matching instead of regex when possible
   - **Lesson**: Be specific with queries to avoid ambiguity; prefer exact text over regex

4. **React Query Provider Setup**
   - **Issue**: Components using React Query hooks need a `QueryClientProvider`
   - **Solution**: Wrapped test components in `QueryClientProvider` with a fresh `QueryClient` per test
   - **Lesson**: Always provide the context that your components depend on

5. **Async State Updates**
   - **Issue**: Tests failing because state updates are asynchronous
   - **Solution**: Used `waitFor()` from React Testing Library to wait for async updates
   - **Lesson**: Always use `waitFor()` when testing async behavior or state changes

### Best Practices Applied

1. **Isolation**: Each test is independent and doesn't rely on previous test state
2. **Cleanup**: Proper `afterEach` cleanup to prevent test pollution
3. **Realistic Mocks**: Mocks return data structures matching real API responses
4. **User-Centric Testing**: Frontend tests focus on user interactions, not implementation details
5. **Error Scenarios**: Both success and error paths are tested
6. **Accessibility**: Tests use queries that screen readers would use (e.g., `getByRole`, `getByText`)

### Running Tests

```bash
# Backend tests
pnpm --filter=worker test assistant.test

# Frontend tests
pnpm --filter=web test-client --testPathPattern=assistant.clienttest

# All tests
pnpm test
```

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

## Key Design Decisions & Rationale

### Architecture Decisions

1. **Custom React Query Hooks vs tRPC**
   - **Decision**: Used custom React Query hooks instead of tRPC
   - **Rationale**: 
     - Endpoints are in the worker (Express), not Next.js tRPC layer
     - Keeps architecture simple while still providing React Query benefits (caching, refetching, optimistic updates)
     - Avoids adding tRPC infrastructure to the worker package
     - Allows direct Express route handling for custom API patterns
   - **Trade-off**: Lose type-safety between frontend/backend, but gain flexibility

2. **Next.js API Proxy Pattern**
   - **Decision**: Next.js API routes proxy requests to worker Express API
   - **Rationale**:
     - Handles CORS automatically (browser → Next.js is same-origin)
     - Provides unified authentication layer (Next.js has session context)
     - Simplifies frontend code (no need to handle CORS or different base URLs)
     - Centralizes error handling and timeout management
   - **Trade-off**: Adds one network hop, but improves security and developer experience

3. **Blocking LLM Calls (Non-Streaming)**
   - **Decision**: Wait for complete LLM response before returning to client
   - **Rationale**:
     - Simpler implementation (no Server-Sent Events or WebSocket complexity)
     - Easier error handling (single response, not partial failures)
     - Simpler state management in frontend
   - **Trade-off**: Users wait for complete response vs. seeing tokens stream in real-time

4. **Database Schema Design**
   - **Decision**: Separate `Conversation` and `Message` tables with explicit indexes
   - **Rationale**:
     - `Conversation` table stores metadata (projectId, userId, startedAt)
     - `Message` table stores content with foreign key to conversation
     - Indexes on `(projectId, startedAt desc)` and `(conversationId, timestamp asc)` optimize common queries
     - Allows efficient pagination and filtering in the future
   - **Trade-off**: More tables vs. single denormalized table, but better query performance

5. **Message Sender Enum (USER | ASSISTANT)**
   - **Decision**: Use enum in database, convert to "user" | "assistant" in API
   - **Rationale**:
     - Database enum provides type safety and validation
     - API uses lowercase strings matching OpenAI's message role format
     - Clear separation between storage format and API contract
   - **Trade-off**: Requires conversion layer, but maintains consistency with OpenAI API

6. **Langfuse Tracing Integration**
   - **Decision**: Create traces for every assistant interaction, even if tracing fails
   - **Rationale**:
     - Observability is critical for LLM applications
     - Traces help debug issues and monitor costs
     - Non-blocking: if tracing fails, conversation still succeeds
     - Creates both TRACE_CREATE and GENERATION_CREATE events for full context
   - **Trade-off**: Adds latency, but provides valuable observability

7. **React Query for State Management**
   - **Decision**: Use React Query instead of Redux or Context API
   - **Rationale**:
     - Built-in caching reduces unnecessary API calls
     - Automatic refetching on window focus/reconnect
     - Optimistic updates support (ready for future enhancement)
     - Handles loading/error states automatically
     - Less boilerplate than Redux
   - **Trade-off**: Adds dependency, but significantly simplifies data fetching logic

8. **Component Structure**
   - **Decision**: Separate `ConversationListSidebar` and `ChatView` components
   - **Rationale**:
     - Single Responsibility Principle: each component has one job
     - Easier to test in isolation
     - Reusable sidebar pattern (matches Langfuse's existing SidePanel component)
     - Clear separation of concerns (list vs. chat)
   - **Trade-off**: More components, but better maintainability

9. **Input Width Matching**
   - **Decision**: Input area uses same `max-w-3xl` as message history
   - **Rationale**:
     - Visual consistency and alignment
     - Messages and input feel like part of same conversation flow
     - Prevents input from being wider than messages (awkward UX)
   - **Trade-off**: None - purely UX improvement

10. **Auto-Focus and Auto-Scroll**
    - **Decision**: Automatically focus input and scroll to bottom on conversation load
    - **Rationale**:
      - Better keyboard accessibility (users can type immediately)
      - Better UX (users see latest messages without manual scrolling)
      - Matches common chat application patterns
    - **Trade-off**: May be annoying if user wants to read old messages, but improves common case

## Error Handling & Edge-Case Considerations

### Backend Error Handling

#### Input Validation
- **Missing Required Fields**: All endpoints validate required parameters (`projectId`, `userId`, `content`)
  - Returns `400 Bad Request` with descriptive error message
  - Prevents invalid data from reaching database

- **Type Validation**: Validates `content` is a string before processing
  - Prevents type errors in downstream code
  - Returns clear error message to user

#### Resource Not Found
- **Conversation Not Found**: `getConversationById` and `addMessageToConversation` check if conversation exists
  - Returns `404 Not Found` with clear error message
  - Prevents creating messages for non-existent conversations

#### Missing Configuration
- **OpenAI API Key Not Configured**: Checks for API key before making LLM call
  - Returns `400 Bad Request` with helpful message: "OpenAI API key not configured for this project"
  - Prevents failed API calls and provides actionable error

#### LLM API Failures
- **OpenAI API Errors**: Wrapped in try-catch, returns `500 Internal Server Error`
  - Includes error details in response for debugging
  - User message is still saved even if LLM call fails (partial success)

#### Database Errors
- **Prisma Errors**: Caught and logged, returns generic `500` error
  - Prevents exposing database internals to clients
  - Logs full error details server-side for debugging

#### Langfuse Tracing Failures
- **Non-Blocking Tracing**: Tracing errors are caught and logged, but don't fail the request
  - Conversation and messages are saved successfully even if tracing fails
  - Logs warning/error for monitoring, but doesn't impact user experience
  - Rationale: Observability is important, but not critical path

### Frontend Error Handling

#### API Proxy Errors
- **Worker Not Running (`ECONNREFUSED`)**: 
  - Detected in `proxyToWorker` utility
  - Returns user-friendly error: "Worker API is not available. Please ensure the worker server is running."
  - Helps developers understand what's wrong during local development

- **Request Timeout**: 
  - 10-second timeout on all proxy requests
  - Returns clear timeout error message
  - Prevents hanging requests

- **Network Errors**: 
  - Caught and passed through to React Query
  - React Query displays error state in UI
  - User can retry the action

#### React Query Error Handling
- **Automatic Error States**: React Query automatically handles:
  - Network failures
  - HTTP error status codes
  - Timeout errors
- **Error Display**: Components show error messages in UI:
  - `ConversationListSidebar`: Shows error message in sidebar
  - `ChatView`: Shows error message in center of chat area

#### User Input Validation
- **Empty Messages**: 
  - Send button disabled when input is empty or whitespace-only
  - Prevents sending empty messages
  - Clear visual feedback (disabled button)

- **Keyboard Shortcuts**:
  - `Enter` sends message (if not empty)
  - `Shift+Enter` creates new line
  - Prevents accidental sends while typing multi-line messages

#### Loading States
- **Conversation Loading**: Shows spinner while fetching conversation
- **Message Sending**: Shows "Assistant is typing..." indicator
- **Button States**: Send button shows spinner and is disabled during send
- **Prevents**: Double-sends, confusion about system state

### Edge Cases Handled

#### Empty States
- **No Conversations**: Shows empty state with icon and "Start Conversation" button
- **No Messages**: Shows "No messages yet. Start the conversation!" message
- **Clear Call-to-Action**: Users know what to do next

#### Message Ordering
- **Chronological Order**: Messages always sorted by `timestamp asc` in database query
- **Consistent Display**: Frontend displays messages in same order
- **Prevents**: Out-of-order messages from causing confusion

#### Concurrent Requests
- **React Query Caching**: Prevents duplicate requests for same conversation
- **Disabled Button**: Prevents sending multiple messages simultaneously
- **Optimistic Updates**: Ready for future enhancement (currently refetches after send)

#### Long Messages
- **Text Wrapping**: Messages use `whitespace-pre-wrap` to preserve formatting
- **Max Width**: Messages limited to 80% of container width for readability
- **Scrollable**: Long conversations scroll within message area

#### Mobile Responsiveness
- **Sidebar**: Uses `SidePanel` component which handles mobile as Sheet/Drawer
- **Input Area**: Safe area insets for mobile keyboards (`env(safe-area-inset-bottom)`)
- **Layout**: Responsive flex layout that stacks on mobile

#### Accessibility
- **ARIA Labels**: All interactive elements have proper labels
- **Keyboard Navigation**: Full keyboard support (Enter to send, Tab navigation)
- **Screen Reader Support**: Proper `role` attributes and `aria-live` regions
- **Focus Management**: Auto-focus on input for better keyboard UX

#### Data Consistency
- **Transaction Safety**: User message saved before LLM call (ensures message exists even if LLM fails)
- **Idempotency**: Message creation is idempotent (same content can be sent multiple times safely)
- **Foreign Key Constraints**: Database enforces conversation exists before message creation

#### Performance Edge Cases
- **Large Conversation History**: Currently sends all messages to LLM (future: sliding window)
- **Many Conversations**: Currently loads all conversations (future: pagination)
- **Slow LLM Responses**: User sees loading indicator, can't send another message until complete

### Error Recovery Strategies

1. **Retry Logic**: React Query automatically retries failed requests (configurable)
2. **Error Messages**: All errors include actionable messages when possible
3. **Partial Success**: User message saved even if LLM call fails
4. **Graceful Degradation**: UI shows error but doesn't crash
5. **Developer Feedback**: Clear errors during development (e.g., "worker not running")

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
