import { Router, IRequest } from 'itty-router';
import { USAspendingAPI } from './services/USASpendingAPI';
import { DeepSearch } from './services/DeepSearch';

interface Env {
  AWARDS_KV: KVNamespace;
  FIRECRAWL_API_KEY: string;
  OPENAI_API_KEY: string;
}

// Extend the Request type to include params
interface RequestWithParams extends IRequest {
  params: {
    [key: string]: string;
  };
}

// Create router with correct typing
const router = Router<RequestWithParams>();

// Add a route to trigger award fetching manually
router.post('/fetch-awards', async (_request, env: Env) => {
  const api = new USAspendingAPI(env.AWARDS_KV);
  try {
    await api.processAwards();
    return Response.json({ status: 'success' });
  } catch (error) {
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
});

router.get('/awards', async (_request, env: Env) => {
  const api = new USAspendingAPI(env.AWARDS_KV);
  const awards = await api.getAllAwards();
  return Response.json(awards);
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
        const searchContext = await deepSearch.searchAward(awardId);
        
        // Store the research results
        await env.AWARDS_KV.put(
            `research:${awardId}`, 
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

    const research = await env.AWARDS_KV.get(`research:${awardId}`);
    if (!research) {
        return new Response('Research not found', { status: 404 });
    }

    return Response.json(JSON.parse(research));
});

// Add a catch-all route for 404s
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Pass env as part of the request context
    return router.handle(request, env)
      .catch(error => {
        console.error('Router error:', error);
        return new Response('Internal Server Error', { status: 500 });
      });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('Running scheduled awards polling...');
    const api = new USAspendingAPI(env.AWARDS_KV);
    
    try {
      await api.processAwards();
      console.log('Finished polling awards');
    } catch (error) {
      console.error('Error during scheduled polling:', error);
    }
  }
}; 