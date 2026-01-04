import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';

// Types
interface Env {
  AI: Ai;
  CHAT_HISTORY: KVNamespace;
  CODE_REVIEW_SESSION: DurableObjectNamespace;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ReviewRequest {
  code: string;
  language?: string;
  sessionId?: string;
  context?: string;
}

interface ReviewResponse {
  review: string;
  sessionId: string;
  timestamp: string;
}

// System prompt for code review
const SYSTEM_PROMPT = `You are an expert code reviewer with deep knowledge of software engineering best practices. Your role is to analyze code and provide:

1. **Security Analysis**: Identify potential security vulnerabilities (SQL injection, XSS, buffer overflows, etc.)
2. **Bug Detection**: Find logical errors, edge cases, and potential runtime issues
3. **Code Quality**: Assess readability, maintainability, and adherence to coding standards
4. **Performance**: Identify inefficiencies and optimization opportunities
5. **Best Practices**: Suggest improvements following industry standards

Format your response clearly with sections. Be constructive and provide specific suggestions with code examples when helpful. If the code is good, acknowledge what's done well.`;

// Utility functions
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function detectLanguage(code: string): string {
  const patterns: Record<string, RegExp[]> = {
    python: [/def\s+\w+\s*\(/, /import\s+\w+/, /from\s+\w+\s+import/, /print\s*\(/],
    javascript: [/const\s+\w+\s*=/, /let\s+\w+\s*=/, /function\s+\w+\s*\(/, /=>\s*{/, /console\.log/],
    typescript: [/:\s*(string|number|boolean|any)/, /interface\s+\w+/, /type\s+\w+\s*=/, /<\w+>/],
    java: [/public\s+(static\s+)?void/, /class\s+\w+/, /System\.out\.print/, /private\s+\w+/],
    cpp: [/#include\s*</, /std::/, /cout\s*<</, /int\s+main\s*\(/],
    rust: [/fn\s+\w+\s*\(/, /let\s+mut/, /impl\s+\w+/, /pub\s+fn/],
    go: [/func\s+\w+\s*\(/, /package\s+\w+/, /import\s*\(/, /fmt\.Print/],
  };

  for (const [lang, regexes] of Object.entries(patterns)) {
    const matches = regexes.filter(regex => regex.test(code)).length;
    if (matches >= 2) return lang;
  }
  return 'unknown';
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());

// API Routes
app.post('/api/review', async (c) => {
  const env = c.env;
  
  try {
    const body: ReviewRequest = await c.req.json();
    const { code, language, sessionId, context } = body;

    if (!code || code.trim().length === 0) {
      return c.json({ error: 'Code is required' }, 400);
    }

    // Generate or use existing session ID
    const currentSessionId = sessionId || generateSessionId();
    
    // Detect language if not provided
    const detectedLanguage = language || detectLanguage(code);

    // Get session from Durable Object
    const sessionStub = env.CODE_REVIEW_SESSION.get(
      env.CODE_REVIEW_SESSION.idFromName(currentSessionId)
    );

    // Get conversation history from session
    const historyResponse = await sessionStub.fetch('http://internal/history');
    const history: ChatMessage[] = await historyResponse.json();

    // Build messages array for LLM
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      {
        role: 'user',
        content: `Please review the following ${detectedLanguage} code:\n\n\`\`\`${detectedLanguage}\n${code}\n\`\`\`${context ? `\n\nAdditional context: ${context}` : ''}`
      }
    ];

    // Call Workers AI with Llama 3.3
    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: messages,
      max_tokens: 2048,
      temperature: 0.3,
    });

    const reviewContent = response.response || 'Unable to generate review.';

    // Store messages in session
    await sessionStub.fetch('http://internal/add', {
      method: 'POST',
      body: JSON.stringify({
        userMessage: messages[messages.length - 1].content,
        assistantMessage: reviewContent
      })
    });

    // Store in KV for persistence
    const kvKey = `${currentSessionId}_${Date.now()}`;
    await env.CHAT_HISTORY.put(kvKey, JSON.stringify({
      code,
      language: detectedLanguage,
      review: reviewContent,
      timestamp: new Date().toISOString()
    }), { expirationTtl: 86400 * 7 }); // 7 days

    const result: ReviewResponse = {
      review: reviewContent,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString()
    };

    return c.json(result);

  } catch (error) {
    console.error('Review error:', error);
    return c.json({ 
      error: 'Failed to process code review',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Chat endpoint for follow-up questions
app.post('/api/chat', async (c) => {
  const env = c.env;
  
  try {
    const { message, sessionId } = await c.req.json();

    if (!message || !sessionId) {
      return c.json({ error: 'Message and sessionId are required' }, 400);
    }

    // Get session from Durable Object
    const sessionStub = env.CODE_REVIEW_SESSION.get(
      env.CODE_REVIEW_SESSION.idFromName(sessionId)
    );

    // Get conversation history
    const historyResponse = await sessionStub.fetch('http://internal/history');
    const history: ChatMessage[] = await historyResponse.json();

    // Build messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    // Call Workers AI
    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: messages,
      max_tokens: 1024,
      temperature: 0.4,
    });

    const assistantMessage = response.response || 'Unable to generate response.';

    // Store in session
    await sessionStub.fetch('http://internal/add', {
      method: 'POST',
      body: JSON.stringify({
        userMessage: message,
        assistantMessage: assistantMessage
      })
    });

    return c.json({
      response: assistantMessage,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Failed to process message' }, 500);
  }
});

// Get session history
app.get('/api/history/:sessionId', async (c) => {
  const env = c.env;
  const sessionId = c.req.param('sessionId');

  try {
    const sessionStub = env.CODE_REVIEW_SESSION.get(
      env.CODE_REVIEW_SESSION.idFromName(sessionId)
    );

    const historyResponse = await sessionStub.fetch('http://internal/history');
    const history = await historyResponse.json();

    return c.json({ sessionId, history });
  } catch (error) {
    return c.json({ error: 'Failed to retrieve history' }, 500);
  }
});

// Clear session
app.delete('/api/session/:sessionId', async (c) => {
  const env = c.env;
  const sessionId = c.req.param('sessionId');

  try {
    const sessionStub = env.CODE_REVIEW_SESSION.get(
      env.CODE_REVIEW_SESSION.idFromName(sessionId)
    );

    await sessionStub.fetch('http://internal/clear', { method: 'POST' });

    return c.json({ message: 'Session cleared', sessionId });
  } catch (error) {
    return c.json({ error: 'Failed to clear session' }, 500);
  }
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve static files
app.get('*', serveStatic({ root: './' }));

// Durable Object for session management
export class CodeReviewSession implements DurableObject {
  private state: DurableObjectState;
  private history: ChatMessage[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<ChatMessage[]>('history');
      this.history = stored || [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case '/history':
        return new Response(JSON.stringify(this.history), {
          headers: { 'Content-Type': 'application/json' }
        });

      case '/add':
        if (request.method === 'POST') {
          const { userMessage, assistantMessage } = await request.json() as {
            userMessage: string;
            assistantMessage: string;
          };
          
          this.history.push({ role: 'user', content: userMessage });
          this.history.push({ role: 'assistant', content: assistantMessage });
          
          // Keep only last 20 messages to manage context window
          if (this.history.length > 20) {
            this.history = this.history.slice(-20);
          }
          
          await this.state.storage.put('history', this.history);
          
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Method not allowed', { status: 405 });

      case '/clear':
        if (request.method === 'POST') {
          this.history = [];
          await this.state.storage.delete('history');
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Method not allowed', { status: 405 });

      default:
        return new Response('Not found', { status: 404 });
    }
  }
}

export default app;
