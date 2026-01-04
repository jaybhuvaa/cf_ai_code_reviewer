# CF AI Code Reviewer

An AI-powered code review assistant built on Cloudflare's edge computing platform. Submit code and receive instant, comprehensive reviews analyzing security vulnerabilities, bugs, performance issues, and best practices.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare)
![Llama 3.3](https://img.shields.io/badge/LLM-Llama%203.3%2070B-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)

## 🚀 Live Demo

**Try it now:** [https://cf-ai-code-reviewer.jaybhuva57.workers.dev/](https://cf-ai-code-reviewer.jaybhuva57.workers.dev/)

## 🎯 Features

- **Instant Code Reviews**: Get comprehensive feedback on your code in seconds
- **Multi-Language Support**: Auto-detects Python, JavaScript, TypeScript, Java, C++, Rust, Go
- **Security Analysis**: Identifies vulnerabilities like SQL injection, XSS, buffer overflows
- **Bug Detection**: Finds logical errors, edge cases, and runtime issues
- **Performance Optimization**: Suggests improvements for better efficiency
- **Conversational Follow-ups**: Ask clarifying questions about the review
- **Session Memory**: Maintains context across multiple interactions
- **Edge-Native**: Runs globally on Cloudflare's network for low latency

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Workers    │───▶│  Workers AI  │    │    Pages     │  │
│  │   (Hono)     │    │ (Llama 3.3)  │    │  (Frontend)  │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                    │
│  ┌──────▼───────┐    ┌──────────────┐                       │
│  │   Durable    │    │      KV      │                       │
│  │   Objects    │    │  (History)   │                       │
│  │  (Sessions)  │    │              │                       │
│  └──────────────┘    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **LLM** | Llama 3.3 70B (Workers AI) | Code analysis and review generation |
| **Workflow** | Cloudflare Workers + Hono | Request routing and API handling |
| **State** | Durable Objects | Session management with conversation history |
| **Persistence** | KV Namespace | Long-term storage of reviews |
| **Frontend** | Static HTML/JS (Pages) | Chat interface for user interaction |

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jaybhuvaa/cf_ai_code_reviewer.git
   cd cf_ai_code_reviewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Login to Cloudflare**
   ```bash
   npx wrangler login
   ```

4. **Create KV namespace**
   ```bash
   npx wrangler kv:namespace create CHAT_HISTORY
   ```
   Update `wrangler.toml` with the returned namespace ID.

5. **Run locally**
   ```bash
   npm run dev
   ```
   Open [http://localhost:8787](http://localhost:8787) in your browser.

### Deployment

```bash
npm run deploy
```

Your application will be live at `https://cf-ai-code-reviewer.<your-subdomain>.workers.dev`

## 📖 API Reference

### POST `/api/review`

Submit code for review.

**Request:**
```json
{
  "code": "def hello(): print('world')",
  "language": "python",
  "context": "Simple greeting function",
  "sessionId": "optional-existing-session"
}
```

**Response:**
```json
{
  "review": "## Code Review\n\n### Security Analysis\n...",
  "sessionId": "session_1234567890_abc",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### POST `/api/chat`

Send follow-up questions about a review.

**Request:**
```json
{
  "message": "Can you explain the security issue in more detail?",
  "sessionId": "session_1234567890_abc"
}
```

**Response:**
```json
{
  "response": "Certainly! The security concern I mentioned...",
  "sessionId": "session_1234567890_abc",
  "timestamp": "2024-01-15T10:31:00.000Z"
}
```

### GET `/api/history/:sessionId`

Retrieve conversation history for a session.

### DELETE `/api/session/:sessionId`

Clear a session and its history.

### GET `/api/health`

Health check endpoint.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Runtime environment | `production` |

### wrangler.toml

```toml
name = "cf-ai-code-reviewer"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "CHAT_HISTORY"
id = "your-kv-namespace-id"

[durable_objects]
bindings = [
  { name = "CODE_REVIEW_SESSION", class_name = "CodeReviewSession" }
]
```

## 🧪 Testing Locally

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Test the API with curl:
   ```bash
   curl -X POST http://localhost:8787/api/review \
     -H "Content-Type: application/json" \
     -d '{"code": "def add(a, b): return a + b"}'
   ```

3. Or use the web interface at [http://localhost:8787](http://localhost:8787)

## 📁 Project Structure

```
cf_ai_code_reviewer/
├── src/
│   └── index.ts          # Main Worker with API routes & Durable Object
├── public/
│   └── index.html        # Frontend chat interface
├── wrangler.toml         # Cloudflare configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript configuration
├── README.md             # Documentation
└── PROMPTS.md            # AI prompts used in development
```

## 🔒 Security Considerations

- Session IDs are randomly generated and time-based
- Conversation history is limited to 20 messages to manage context window
- KV entries expire after 7 days
- No user authentication required (can be added via Cloudflare Access)

## 🛠️ Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (lightweight web framework)
- **LLM**: Meta Llama 3.3 70B via Workers AI
- **State Management**: Durable Objects
- **Storage**: Workers KV
- **Language**: TypeScript
- **Frontend**: Vanilla HTML/CSS/JavaScript

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👤 Author

**Jaykumar Bhuva**
- GitHub: [@jaybhuvaa](https://github.com/jaybhuvaa)
- LinkedIn: [jay-bhuva](https://linkedin.com/in/jay-bhuva)
- Portfolio: [jaybhuva.me](https://jaybhuva.me)

---

Built with ❤️ on Cloudflare Workers
