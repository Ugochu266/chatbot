# SafeChat Implementation Todo List

A comprehensive checklist for implementing the SafeChat AI Customer Support Chatbot with Integrated Safety Mechanisms.

**Deployment Architecture:** Render + Neon (2 Platforms)

| Component | Platform | Service Type |
|-----------|----------|--------------|
| Frontend (React) | Render | Static Site - Free, unlimited, global CDN |
| Backend (Express) | Render | Web Service - Free, 750 hrs/month |
| Database (PostgreSQL) | Neon | Serverless DB - Free, 0.5GB, never pauses |

---

## Phase 1: Infrastructure Setup

### 1.1 Database Setup (Neon)
- [ ] Create Neon account at https://neon.tech
- [ ] Create new project named `safechat`
- [ ] Run `schema.sql` in Neon SQL Editor
- [ ] Verify all tables created: `conversations`, `messages`, `knowledge_base`, `moderation_logs`
- [ ] Copy connection string to `.env` file
- [ ] Test database connection from local environment

### 1.2 Render Setup (Backend + Frontend)
- [ ] Create Render account at https://render.com
- [ ] Connect GitHub repository

**Backend (Web Service):**
- [ ] Create New → Web Service
- [ ] Set root directory: `server`
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Configure environment variables:
  - [ ] `DATABASE_URL` (from Neon)
  - [ ] `OPENAI_API_KEY`
  - [ ] `NODE_ENV=production`
  - [ ] `CORS_ORIGIN` (frontend URL after deploy)

**Frontend (Static Site):**
- [ ] Create New → Static Site
- [ ] Set root directory: `client`
- [ ] Build command: `npm install && npm run build`
- [ ] Publish directory: `build`
- [ ] Configure environment variables:
  - [ ] `REACT_APP_API_URL` (backend URL after deploy)

### 1.3 Keep-Alive Setup (UptimeRobot)
- [ ] Create UptimeRobot account at https://uptimerobot.com
- [ ] Add HTTP(s) monitor for `/api/health` endpoint
- [ ] Set 5-minute monitoring interval

---

## Phase 2: Backend Core (Node.js/Express)

### 2.1 Database Layer (`server/db/`)
- [ ] Create `db/index.js` - Neon serverless client setup
- [ ] Create `db/conversations.js` - Conversation CRUD operations
  - [ ] `createConversation(sessionId)`
  - [ ] `getConversation(id)`
  - [ ] `listConversations(sessionId, page, limit)`
  - [ ] `updateEscalation(id, reason)`
- [ ] Create `db/messages.js` - Message CRUD operations
  - [ ] `createMessage(conversationId, role, content, metadata)`
  - [ ] `getMessages(conversationId, limit)`
  - [ ] `updateModerationFlag(id, flagged)`
- [ ] Create `db/knowledgeBase.js` - Knowledge base operations
  - [ ] `searchDocuments(query, limit)`
  - [ ] `getDocumentsByCategory(category)`
  - [ ] `addDocument(title, category, content, keywords)`

### 2.2 API Routes (`server/routes/`)
- [ ] Create `routes/conversations.js`
  - [ ] `POST /api/conversations` - Create new conversation
  - [ ] `GET /api/conversations/:id` - Get conversation with messages
  - [ ] `GET /api/conversations` - List session conversations (paginated)
- [ ] Create `routes/messages.js`
  - [ ] `POST /api/messages` - Send message and get response
  - [ ] `GET /api/messages/stream/:id` - SSE streaming endpoint
- [ ] Create `routes/admin.js`
  - [ ] `GET /api/admin/escalations` - List escalated conversations
- [ ] Wire up routes in `index.js`

### 2.3 Middleware (`server/middleware/`)
- [ ] Create `middleware/rateLimiter.js` - 20 req/min per session
- [ ] Create `middleware/sessionHandler.js` - Session ID management
- [ ] Create `middleware/errorHandler.js` - Centralized error handling
- [ ] Create `middleware/validator.js` - Input validation (2000 char limit)

---

## Phase 3: Safety Mechanisms

### 3.1 Input Sanitization (`server/services/sanitization.js`)
- [ ] Implement message length validation (max 2000 chars)
- [ ] Implement HTML/script tag stripping
- [ ] Implement basic prompt injection detection
  - [ ] Pattern: "ignore previous instructions"
  - [ ] Pattern: "disregard your instructions"
  - [ ] Pattern: "you are now..."
  - [ ] Pattern: "pretend you are..."
  - [ ] Pattern: system prompt extraction attempts
- [ ] Create sanitization pipeline function
- [ ] Add logging for blocked inputs

### 3.2 Content Moderation (`server/services/moderation.js`)
- [ ] Set up OpenAI Moderation API client
- [ ] Implement `moderateContent(text)` function
- [ ] Handle moderation categories:
  - [ ] `hate`
  - [ ] `violence`
  - [ ] `self-harm`
  - [ ] `sexual`
  - [ ] `harassment`
- [ ] Create fallback response for flagged content
- [ ] Log all moderation decisions to `moderation_logs` table
- [ ] Implement both input and output moderation

### 3.3 RAG System (`server/services/rag.js`)
- [ ] Implement keyword-based document search
- [ ] Create `retrieveContext(query)` function
  - [ ] Extract keywords from query
  - [ ] Search `knowledge_base` table
  - [ ] Return top 3 relevant documents
- [ ] Format retrieved context for prompt injection
- [ ] Implement uncertainty acknowledgment for undocumented topics
- [ ] Create prompt template with retrieved context

### 3.4 Escalation Detection (`server/services/escalation.js`)
- [ ] Implement crisis keyword detection
  - [ ] Self-harm indicators
  - [ ] Suicide-related terms
- [ ] Implement legal/complaint keywords
  - [ ] "lawyer", "lawsuit", "sue"
  - [ ] "manager", "supervisor", "complaint"
  - [ ] "refund", "attorney"
- [ ] Implement basic sentiment analysis (negative threshold)
- [ ] Create crisis resource response template
- [ ] Create escalation flagging function
- [ ] Log escalation reasons

### 3.5 Safety Pipeline (`server/services/pipeline.js`)
- [ ] Create unified safety pipeline function:
  1. Input validation (length, format)
  2. Input sanitization (strip tags, injection check)
  3. Input moderation (OpenAI API)
  4. Knowledge retrieval (RAG)
  5. Response generation (OpenAI GPT-4)
  6. Output moderation (OpenAI API)
  7. Escalation check
  8. Response delivery / escalation trigger

---

## Phase 4: OpenAI Integration

### 4.1 OpenAI Service (`server/services/openai.js`)
- [ ] Set up OpenAI client with API key
- [ ] Create system prompt for customer support persona
- [ ] Implement `generateResponse(messages, context)` function
- [ ] Implement streaming response with SSE
- [ ] Handle rate limits and errors
- [ ] Track token usage for cost monitoring
- [ ] Implement conversation history management (last 10 exchanges)

### 4.2 Prompt Engineering
- [ ] Create base system prompt
- [ ] Add safety instructions to system prompt
- [ ] Create RAG context injection template
- [ ] Create escalation-aware response template
- [ ] Test and refine prompts for accuracy

---

## Phase 5: Frontend (React)

### 5.1 Core Components (`client/src/components/`)
- [ ] Create `ChatContainer.jsx` - Main chat wrapper
- [ ] Create `MessageList.jsx` - Scrollable message display
- [ ] Create `MessageBubble.jsx` - Individual message UI
- [ ] Create `ChatInput.jsx` - Text input with send button
- [ ] Create `TypingIndicator.jsx` - Streaming response indicator
- [ ] Create `Header.jsx` - App header with branding
- [ ] Create `ConversationList.jsx` - Past conversations sidebar
- [ ] Create `EscalationBanner.jsx` - Escalation notification UI
- [ ] Create `ErrorBoundary.jsx` - Error handling wrapper

### 5.2 API Services (`client/src/services/`)
- [ ] Create `api.js` - Axios instance with base URL
- [ ] Create `conversationService.js`
  - [ ] `createConversation()`
  - [ ] `getConversation(id)`
  - [ ] `listConversations()`
- [ ] Create `messageService.js`
  - [ ] `sendMessage(conversationId, content)`
  - [ ] `streamResponse(messageId, onChunk)`

### 5.3 State Management (`client/src/hooks/`)
- [ ] Create `useConversation.js` - Conversation state hook
- [ ] Create `useMessages.js` - Messages state with streaming
- [ ] Create `useSession.js` - Session ID management (localStorage)

### 5.4 UI/UX Polish
- [ ] Implement Material-UI theme customization
- [ ] Add loading states and skeletons
- [ ] Implement auto-scroll to latest message
- [ ] Add message timestamps
- [ ] Implement responsive design (mobile-friendly)
- [ ] Add keyboard shortcuts (Enter to send)
- [ ] Implement character count display (2000 limit)
- [ ] Add error toast notifications

---

## Phase 6: Knowledge Base Content

### 6.1 Create Documentation (`server/knowledge/`)
- [ ] Create 20+ support documents in markdown format:
  - [ ] Product FAQs (5 docs)
  - [ ] Pricing and billing (3 docs)
  - [ ] Account management (3 docs)
  - [ ] Technical troubleshooting (4 docs)
  - [ ] Policies (returns, privacy, terms) (3 docs)
  - [ ] Common issues and solutions (2 docs)
- [ ] Create seed script to populate `knowledge_base` table
- [ ] Extract and assign keywords to each document

---

## Phase 7: Admin Dashboard

### 7.1 Admin Components
- [ ] Create `AdminDashboard.jsx` - Escalation overview
- [ ] Create `EscalationList.jsx` - List of escalated conversations
- [ ] Create `ConversationViewer.jsx` - Full conversation detail view
- [ ] Implement basic auth protection (optional for demo)

---

## Phase 8: Testing

### 8.1 Unit Tests
- [ ] Test sanitization functions
- [ ] Test escalation keyword detection
- [ ] Test moderation integration
- [ ] Test RAG document retrieval
- [ ] Test API route handlers

### 8.2 Safety Test Suites
- [ ] Create 20 toxic prompt test cases
- [ ] Create 20 safe prompt test cases
- [ ] Create 15 prompt injection test cases
- [ ] Create 25 RAG accuracy test cases (documented topics)
- [ ] Create 25 RAG test cases (undocumented topics)
- [ ] Create 20 escalation trigger test cases
- [ ] Create 20 normal conversation test cases

### 8.3 Integration Tests
- [ ] Test full message flow (input -> safety -> response)
- [ ] Test SSE streaming functionality
- [ ] Test conversation persistence
- [ ] Test escalation flow

### 8.4 Performance Tests
- [ ] Verify response time < 5 seconds
- [ ] Verify time to first token < 2 seconds
- [ ] Verify safety check overhead < 0.5 seconds
- [ ] Test cold start time < 30 seconds

---

## Phase 9: Deployment & Go-Live

### 9.1 Pre-Deployment Checklist
- [ ] Remove all console.log statements
- [ ] Verify all environment variables set
- [ ] Test local build succeeds
- [ ] Run full test suite
- [ ] Review security headers

### 9.2 Deployment (Both on Render)
- [ ] Deploy backend Web Service to Render
- [ ] Verify health endpoint accessible at `https://safechat-api.onrender.com/api/health`
- [ ] Deploy frontend Static Site to Render
- [ ] Note frontend URL: `https://safechat-frontend.onrender.com`
- [ ] Update backend `CORS_ORIGIN` with frontend URL
- [ ] Update frontend `REACT_APP_API_URL` with backend URL
- [ ] Trigger redeployment of both services
- [ ] Activate UptimeRobot monitoring for backend

### 9.3 Post-Deployment Verification
- [ ] Test full conversation flow on production
- [ ] Verify moderation working
- [ ] Verify RAG responses accurate
- [ ] Verify escalation detection
- [ ] Check response times
- [ ] Confirm $0 infrastructure cost (Render + Neon free tiers)

---

## Phase 10: Documentation

- [ ] Update README.md with:
  - [ ] Project overview
  - [ ] Architecture diagram
  - [ ] Local development setup
  - [ ] Deployment instructions (Render)
  - [ ] Environment variables reference
- [ ] Document API endpoints
- [ ] Document safety mechanisms
- [ ] Create demo script/walkthrough

---

## Success Criteria Checklist

- [ ] All four safety mechanisms implemented and functional
- [ ] Content moderation achieves >75% recall
- [ ] RAG improves factual accuracy by >40% vs baseline
- [ ] Average response time < 5 seconds
- [ ] Deployed on Render (frontend + backend) + Neon (database)
- [ ] Escalation detection catches >70% of test cases
- [ ] Total infrastructure cost: $0

---

## Quick Start Commands

```bash
# Install dependencies
npm install

# Run locally (both client and server)
npm run dev

# Run only backend
npm run dev:server

# Run only frontend
npm run dev:client

# Run tests
npm test

# Build for production
npm run build
```

---

## Reference URLs

| Resource | URL |
|----------|-----|
| Render Dashboard | https://dashboard.render.com |
| Neon Dashboard | https://console.neon.tech |
| UptimeRobot | https://uptimerobot.com |
| OpenAI API Keys | https://platform.openai.com/api-keys |

---

**Last Updated:** January 2026 (PRD v3.0)
