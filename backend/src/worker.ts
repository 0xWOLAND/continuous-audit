import { Router, IRequest } from 'itty-router';
import { USAspendingAPI } from './services/USASpendingAPI';
import { DeepSearch } from './services/DeepSearch';

interface Env {
  AWARDS_KV: KVNamespace;
  RESEARCH_KV: KVNamespace;  // New KV namespace for research results
  FIRECRAWL_API_KEY: string;
  OPENAI_API_KEY: string;
  ENVIRONMENT?: string;  // Optional since it might not be set in dev
}

// Extend the Request type to include params
interface RequestWithParams extends IRequest {
  params: {
    [key: string]: string;
  };
}

// Create router with correct typing
const router = Router<RequestWithParams>();

// Add CORS headers to responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS requests for CORS
router.options('*', () => new Response(null, {
  headers: corsHeaders
}));

// Add a route to trigger award fetching manually
router.post('/fetch-awards', async (_request, env: Env) => {
  const api = new USAspendingAPI(env.AWARDS_KV);
  try {
    const awards = await api.processAwards();
    return Response.json({ awards, status: 200 });
  } catch (error) {
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
});

router.get('/test', async (_request, env: Env) => {
  return new Response('Test successful', {
    headers: corsHeaders
  });
});

router.get('/awards', async (_request, env: Env) => {
  const api = new USAspendingAPI(env.AWARDS_KV);
  const awards = await api.getAllAwards();
  return Response.json(awards, {
    headers: corsHeaders
  });
});

router.get('/awards/:awardId', async (request, env: Env) => {
  const awardId = request.params?.awardId;
  if (!awardId) {
    return new Response('Award ID is required', { status: 400 });
  }

  const api = new USAspendingAPI(env.AWARDS_KV);
  const award = await api.getAward(awardId);
  
  if (!award) {
    return new Response('Award not found', { status: 404 });
  }
  
  return Response.json(award);
});

// Add a new route for deep search
router.post('/awards/:awardId/research', async (request, env: Env) => {
    const awardId = request.params?.awardId;
    if (!awardId) {
        return new Response('Award ID is required', { status: 400 });
    }

    const api = new USAspendingAPI(env.AWARDS_KV);
    const award = await api.getAward(awardId);

    if (!award) {
        return new Response('Award not found', { status: 404 });
    }

    try {
        const deepSearch = new DeepSearch(env);
        const searchContext = await deepSearch.searchAward(awardId, award);
        
        await env.RESEARCH_KV.put(
            awardId, 
            JSON.stringify(searchContext)
        );

        return Response.json(searchContext);
    } catch (error) {
        console.error('Research error:', error);
        return new Response('Research failed', { status: 500 });
    }
});

// Add a route to get research results
router.get('/awards/:awardId/research', async (request, env: Env) => {
    const awardId = request.params?.awardId;
    if (!awardId) {
        return new Response('Award ID is required', { status: 400 });
    }

    const research = await env.RESEARCH_KV.get(awardId);
    if (!research) {
        return new Response('Research not found', { status: 404 });
    }

    return Response.json(JSON.parse(research));
});

// Add base path handler
router.get('/', async (_request, env: Env) => {
  return new Response('Federal Fraud Detection Service', {
    headers: {
      'Content-Type': 'text/plain'
    }
  });
});

// Add a catch-all route for 404s
router.all('*', () => new Response('Not Found', { status: 404 }));

const corsify = (response: Response): Response => {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return router.handle(request, env)
      .then(corsify)
      .catch(error => {
        console.error('Router error:', error);
        return corsify(new Response('Internal Server Error', { status: 500 }));
      });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const api = new USAspendingAPI(env.AWARDS_KV);
    
    try {
        await api.processAwards();

        const isTestScheduled = event.cron === 'test-scheduled';
        if (isTestScheduled) return;

        const allAwards = await env.AWARDS_KV.list();
        const deepSearch = new DeepSearch(env);

        for (const key of allAwards.keys) {
            if (key.name.startsWith('research:')) continue;

            const hasResearch = await env.AWARDS_KV.get(`research:${key.name}`);
            if (hasResearch) continue;

            const award = await api.getAward(key.name);
            if (!award) continue;

            try {
                await deepSearch.searchAward(key.name, award);
            } catch (error) {
                console.error(`Research failed for award ${key.name}:`, error);
            }
        }
    } catch (error) {
        console.error('Error during scheduled polling:', error);
    }
  }
}; 