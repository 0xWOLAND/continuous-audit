import * as dotenv from 'dotenv';
import { AwardSearchContext, ProcessedAward } from '../src/types';
import worker from '../src/worker';
import { AWARDS_KV } from './mock-kv';
import { mockScheduledEvent } from './mock-scheduled-event';
dotenv.config();

interface Award {
    basicInfo: {
        recipientName: string;
        awardAmount: number;
    };
}

interface AwardsResponse {
    [key: string]: Award;
}

async function testRiskScores() {
    const workerUrl = 'http://localhost:8787';
    console.log('Starting risk score analysis...');
    
    try {
        // First trigger a manual fetch of awards
        console.log('\nTriggering award fetch...');
        const fetchResponse = await fetch(`${workerUrl}/fetch-awards`, {
            method: 'POST'
        });
        
        if (!fetchResponse.ok) {
            throw new Error(`Failed to trigger award fetch: ${fetchResponse.status}`);
        }
        console.log('Award fetch completed');

        // Now proceed with the rest of the test
        const awardsResponse = await fetch(`${workerUrl}/awards`);
        if (!awardsResponse.ok) {
            throw new Error(`Failed to fetch awards: ${awardsResponse.status}`);
        }
        const awards = await awardsResponse.json() as AwardsResponse;
        
        console.log(`Found ${Object.keys(awards).length} awards`);
        
        // For each award, get its research results
        for (const awardId of Object.keys(awards)) {
            console.log(`\nChecking research for award: ${awardId}`);
            const award = awards[awardId];
            
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
                    displayRiskAnalysis(research, award);
                    continue;
                }
                
                if (!researchResponse.ok) {
                    console.error(`Error fetching research: ${researchResponse.status}`);
                    continue;
                }
                
                const research = await researchResponse.json() as AwardSearchContext;
                displayRiskAnalysis(research, award);
                
            } catch (error) {
                console.error(`Error processing award ${awardId}:`, error);
            }
        }
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

function displayRiskAnalysis(research: AwardSearchContext, award: Award) {
    const riskLevel = research.findings.reduce((max, f) => 
        Math.max(max, f.analysis.reasoning.riskLevel), 0);
    
    console.log('\nRisk Analysis:');
    console.log('-------------');
    console.log(`Award ID: ${research.originalAwardId}`);
    console.log(`Recipient: ${award.basicInfo.recipientName}`);
    console.log(`Amount: $${award.basicInfo.awardAmount.toLocaleString()}`);
    console.log(`Risk Level: ${riskLevel}/5`);
    
    if (research.findings.length > 0) {
        console.log('\nKey Findings:');
        research.findings
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3)
            .forEach((finding, i) => {
                console.log(`\n${i + 1}. Source: ${finding.source}`);
                console.log(`   Risk Level: ${finding.analysis.reasoning.riskLevel}`);
                console.log(`   Justification: ${finding.analysis.reasoning.justification}`);
            });
    }
    
    if (research.reasoningChain.finalConclusions.length > 0) {
        console.log('\nFinal Conclusions:');
        research.reasoningChain.finalConclusions.forEach((conclusion, i) => {
            console.log(`${i + 1}. ${conclusion}`);
        });
    }
    
    console.log('\n' + '='.repeat(80));
}

// Run the test
console.log('Note: Make sure your worker is running with `pnpm dev` before running this test');
testRiskScores()
    .then(() => console.log('\nTest completed'))
    .catch(console.error); 