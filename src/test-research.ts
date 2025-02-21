import * as dotenv from 'dotenv';
dotenv.config();

import { DeepSearch } from './services/DeepSearch';

// Mock KV namespace for testing
const mockKV: KVNamespace = {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [] }),
} as unknown as KVNamespace;

async function testResearch() {
    const env = {
        AWARDS_KV: mockKV,
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
    };

    if (!env.FIRECRAWL_API_KEY || !env.OPENAI_API_KEY) {
        console.error('Missing required API keys. Please set FIRECRAWL_API_KEY and OPENAI_API_KEY environment variables.');
        process.exit(1);
    }

    const testAwardId = process.argv[2] || 'CONT_AWD_N0001423C4408_9700_-NONE-_-NONE-';
    console.log(`Starting research for award: ${testAwardId}`);

    try {
        const deepSearch = new DeepSearch(env);
        const results = await deepSearch.searchAward(testAwardId);

        console.log('\nResearch Results:');
        console.log('================');
        console.log('\nSummary:', results.summary);
        
        console.log('\nFindings:', results.findings.length);
        results.findings.forEach((finding, i) => {
            console.log(`\nFinding ${i + 1}:`);
            console.log('Source:', finding.source);
            console.log('Relevance:', finding.relevanceScore);
            console.log('Analysis:', finding.analysis.reasoning);
        });

        console.log('\nReasoning Chain:');
        results.reasoningChain.steps.forEach((step, i) => {
            console.log(`\nStep ${i + 1}:`);
            console.log('Stage:', step.stage);
            console.log('Reasoning:', step.reasoning);
            console.log('Confidence:', step.confidence);
        });

        console.log('\nFinal Conclusions:');
        results.reasoningChain.finalConclusions.forEach((conclusion, i) => {
            console.log(`${i + 1}. ${conclusion}`);
        });

    } catch (error) {
        console.error('Research failed:', error);
    }
}

// Run the test
console.log('Note: Make sure you have set FIRECRAWL_API_KEY and OPENAI_API_KEY environment variables');
testResearch()
    .then(() => console.log('\nTest completed'))
    .catch(console.error); 