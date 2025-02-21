import * as dotenv from 'dotenv';
import { AwardSearchContext } from '../src/types';
dotenv.config();

interface Award {
    id: string;
    // Add other award properties as needed
}

async function testRiskScores() {
    const workerUrl = 'http://localhost:8787';
    console.log('Fetching risk scores for all awards...');
    
    try {
        // First get all awards from the worker endpoint
        const awardsResponse = await fetch(`${workerUrl}/awards`);
        if (!awardsResponse.ok) {
            throw new Error(`Failed to fetch awards: ${awardsResponse.status}`);
        }
        const awards = await awardsResponse.json() as Record<string, Award>;
        
        console.log(`Found ${Object.keys(awards).length} awards`);
        
        // For each award, get its research results
        for (const awardId of Object.keys(awards)) {
            console.log(`\nChecking research for award: ${awardId}`);
            
            try {
                const researchResponse = await fetch(`${workerUrl}/awards/${awardId}/research`);
                
                if (researchResponse.status === 404) {
                    // Try to trigger research if not found
                    console.log('No research found, triggering research...');
                    const triggerResponse = await fetch(`${workerUrl}/awards/${awardId}/research`, {
                        method: 'POST'
                    });
                    if (!triggerResponse.ok) {
                        console.error('Failed to trigger research');
                        continue;
                    }
                    const research = await triggerResponse.json() as AwardSearchContext;
                    displayResearchResults(research);
                    continue;
                }
                
                if (!researchResponse.ok) {
                    console.error(`Error fetching research: ${researchResponse.status}`);
                    continue;
                }
                
                const research = await researchResponse.json() as AwardSearchContext;
                displayResearchResults(research);
                
            } catch (error) {
                console.error(`Error processing award ${awardId}:`, error);
            }
        }
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

function displayResearchResults(research: AwardSearchContext) {
    console.log('\nRisk Assessment:');
    console.log('---------------');
    console.log('Summary:', research.summary);
    
    if (research.findings.length > 0) {
        const highestRisk = research.findings
            .reduce((max, finding) => Math.max(max, finding.analysis.reasoning.riskLevel), 0);
        
        console.log('\nHighest Risk Level:', highestRisk);
        console.log('Key Findings:');
        research.findings
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3)
            .forEach((finding, i) => {
                console.log(`\n${i + 1}. Source: ${finding.source}`);
                console.log(`   Risk Level: ${finding.analysis.reasoning.riskLevel}`);
                console.log(`   Justification: ${finding.analysis.reasoning.justification}`);
            });
    }
    
    console.log('\nFinal Conclusions:');
    research.reasoningChain.finalConclusions.forEach((conclusion, i) => {
        console.log(`${i + 1}. ${conclusion}`);
    });
    
    console.log('\n' + '='.repeat(80));
}

// Run the test
console.log('Note: Make sure your worker is running with `pnpm dev` before running this test');
testRiskScores()
    .then(() => console.log('\nTest completed'))
    .catch(console.error); 