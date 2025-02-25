# Federal Contract Fraud Detection System

An AI-powered system for detecting potential fraud indicators in federal contract awards.


https://github.com/user-attachments/assets/50a24aeb-bc0d-4fc6-901c-d89cf1f95474


The deep research system works by recursively investigating federal contracts for potential fraud indicators. Starting with an award ID, it generates initial search topics about the company, its executives, and location, then uses Firecrawl to search and crawl relevant web pages. Each discovered page is analyzed by GPT-4 for fraud indicators across multiple categories (like unusual pricing, shell company signs, or geographic risks), with content split into manageable chunks for processing. When the analysis reveals concerning patterns (risk level > 1), those findings are stored and GPT-4 generates follow-up questions that feed back into the search queue as new topics to investigate, creating a recursive research loop that continues until hitting limits. 

The architecture is split into a few parts: 
1. The backend API, which is a Cloudflare worker that fetches awards from USASpending.gov and stores them in a KV store.
2. The research system, which is a Cloudflare worker that uses GPT-4 to recursively investigate federal contracts for potential fraud indicators.
3. The frontend, which is a static site that displays the research results.
4. The proxy server, which is a simple server that proxies requests to USASpending.gov and caches the results. This is necessary because of Cloudflare's strict limits on outgoing requests from workers.

> [!WARNING]
> The research process takes a while to run (~5-10 minutes) because of rate limits. Loading the page may take a while (~1 minute). Also, you may need to reload the page to see the latest results.

## API Endpoints

### Awards
- `POST /fetch-awards` - Manually trigger fetching of new awards from USASpending.gov
- `GET /awards` - Get all awards in the system
- `GET /awards/:awardId` - Get details for a specific award

### Research
- `POST /awards/:awardId/research` - Trigger fraud analysis for a specific award
- `GET /awards/:awardId/research` - Get research results for a specific award

## Scheduled Tasks
The system runs every 6 hours to:
1. Fetch new awards from USASpending.gov
2. Automatically research any awards that haven't been analyzed
3. Store results in KV storage

## Future Work
- Fine-tuning the results of the LLMs to improve the quality of the research
  - Use larger models (didn't do this because of cost)
  - Integrate more data sources than the whole internet -- which has noise-to-signal ratio issues
- More ergonomic way of interacting with the USAspending API
  - Currently, the API is poorly designed. It uses `POST` requests to fetch data and is incredibly large and complex. 
- Possibly integrate new ways of verifying awards with people's reports/tips/etc.
  - Could use LLMs to verify if a report is credible or not and then use that to verify awards 
- More efficient ways of querying LLMs 
  - OpenAI requests could be queued up and sent in batches
