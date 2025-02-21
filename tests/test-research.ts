import * as dotenv from 'dotenv';
import { AwardSearchContext } from '../src/types';  // Import the type
dotenv.config();

async function testResearch() {
    const workerUrl = 'http://localhost:8787';
    
    try {
        // First get all awards
        console.log('Fetching awards...');
        const awardsResponse = await fetch(`${workerUrl}/awards`);
        if (!awardsResponse.ok) {
            throw new Error(`Failed to fetch awards: ${awardsResponse.status}`);
        }
        
        const awards = await awardsResponse.json();
        const awardIds = Object.keys(awards);
        
        if (awardIds.length === 0) {
            throw new Error('No awards found');
        }

        // Use first award or command line argument
        const testAwardId = process.argv[2] || awardIds[0];
        console.log(`Starting research for award: ${testAwardId}`);

        // Try to get existing research
        const researchResponse = await fetch(`${workerUrl}/awards/${testAwardId}/research`);
        
        let results: AwardSearchContext;
        if (researchResponse.status === 404) {
            // Trigger new research
            console.log('No existing research found, triggering new research...');
            const triggerResponse = await fetch(`${workerUrl}/awards/${testAwardId}/research`, {
                method: 'POST'
            });
            if (!triggerResponse.ok) {
                throw new Error(`Research failed: ${triggerResponse.status}`);
            }
            results = await triggerResponse.json();
        } else if (researchResponse.ok) {
            results = await researchResponse.json();
        } else {
            throw new Error(`Research failed: ${researchResponse.status}`);
        }

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