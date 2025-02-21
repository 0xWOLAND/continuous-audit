export const PROMPTS = {
    INITIAL_REASONING: (awardId: string, enrichedContext: string) => `
You are a federal contract investigator specializing in fraud detection. Review this award information and related content about award ${awardId}.

Consider these specific risk factors:
1. Unusual pricing or competition patterns
2. Shell company indicators
3. Geographic risk factors
4. Contract modification patterns
5. Relationship with other contractors
6. History of performance issues
7. Unusual transaction patterns

Award Context:
${enrichedContext}

What are your initial thoughts about potential fraud indicators? Be specific and reference the data.`,

    GENERATE_INVESTIGATION_QUESTIONS: (awardId: string) => `
Based on what we know about award ${awardId}, generate targeted questions for investigation.
Format your response as a JSON object with this structure:
{
    "questions": [
        {
            "question": "specific question to investigate",
            "priority": number // 1-5 where 5 is highest priority
        }
    ]
}
Rate priority based on potential fraud risk and urgency of investigation.`,

    IDENTIFY_FRAUD_INDICATORS: (awardId: string, enrichedContext: string) => `
Analyze this information about award ${awardId} for specific fraud indicators.
Consider these red flags:
1. Unusual contract modifications or pricing
   - Significant price increases without clear justification
   - Frequent modifications changing scope/price
   - Pricing substantially different from market rates
   - Split purchases to stay under thresholds

2. Shell company characteristics 
   - Recently formed companies winning large contracts
   - No physical business location or minimal staff
   - Multiple companies sharing addresses/phone numbers
   - Missing registration/certification documentation

3. Multiple awards to same contractor
   - Pattern of winning most/all contracts in category
   - Multiple contract awards just below thresholds
   - Winning despite higher prices than competitors
   - Suspicious timing between multiple awards

4. Geographic anomalies
   - Business address far from performance location
   - Cluster of related companies in same location
   - Work performed far from contractor location
   - Multiple contractors sharing same address

5. Unusual subcontracting patterns
   - Large portion of work subcontracted out
   - Subcontractors with connections to prime
   - Hidden subcontractor relationships
   - Pass-through contracting arrangements

6. Suspicious timing of awards/modifications
   - End of year/budget period awards
   - Rushed awards with minimal review
   - Pattern of modifications at specific intervals
   - Quick award after minimal competition period

7. Relationship with government officials
   - Current/former government employees involved
   - Family/business ties to contracting staff
   - Undisclosed conflicts of interest
   - Preferential treatment in awards

8. History of investigations or complaints
   - Past performance issues or investigations
   - Pattern of bid protests or complaints
   - Debarment/suspension of related entities
   - History of contract terminations

Award Context:
${enrichedContext}

List any red flags or suspicious patterns you've identified.
Be specific and cite evidence from the content.`,

    ASSESS_FRAUD_RISK: (awardId: string) => `
You are investigating award ${awardId} for potential fraud. Your assessment must be evidence-based and specific.

For any risk factors you identify, you MUST:
1. Quote the exact text that indicates the risk
2. Explain specifically why this text indicates fraud risk
3. Cite specific numbers, dates, or patterns when available

Return your assessment in this format:
{
    "riskLevel": number, // 1-5 where:
                        // 1: No significant concerns
                        // 2: Minor irregularities
                        // 3: Notable red flags
                        // 4: Serious concerns
                        // 5: Critical risk indicators
    "justification": "Detailed explanation with quotes and evidence",
    "keyFactors": [
        "Quote: '...' - Specific explanation of why this is concerning",
        "Pattern: ... - Specific data showing the pattern"
    ]
}

Example good justification:
"Quote: 'Contract modified 7 times in 30 days, increasing value from $100,000 to $2.3M' - Rapid modifications and 2300% increase suggests price manipulation.
Quote: 'Single bid received despite being listed as full competition' - Indicates possible bid rigging.
Pattern: All 5 modifications occurred exactly 7 days apart (1/1, 1/8, 1/15, etc) suggesting automated or predetermined changes."

Example bad justification (too vague):
"Contract shows unusual patterns and concerning modifications. The pricing seems suspicious and there are competition issues."`,
}; 