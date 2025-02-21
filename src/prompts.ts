import { z } from 'zod';

export const InvestigationQuestions = z.object({
    questions: z.array(z.object({
        question: z.string(),
        priority: z.number().min(1).max(5)  // 1-5 priority scale
    }))
});

export const RiskAssessment = z.object({
    riskLevel: z.number().min(1).max(5),
    justification: z.string(),
    keyFactors: z.array(z.string())
});

export const PROMPTS = {
    INITIAL_REASONING: (awardId: string) => `
You are a federal contract investigator. Review this content about award ${awardId}.
What are your initial thoughts about potential fraud indicators? Be concise and direct.`,

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

    IDENTIFY_FRAUD_INDICATORS: (awardId: string) => `
Analyze this information about award ${awardId} for specific fraud indicators.
List any red flags or suspicious patterns you've identified.
Be specific and cite evidence from the content.`,

    ASSESS_FRAUD_RISK: (awardId: string) => `
Assess the fraud risk for award ${awardId} based on how closely the award matches the following definitions:

Fraud is defined as the wrongful or criminal deception intended to result in financial or personal gain. Fraud includes false representation of fact, making false statements, or by concealment of information.

Waste is defined as the thoughtless or careless expenditure, mismanagement, or abuse of resources to the detriment (or potential detriment) of the U.S. government. Waste also includes incurring unnecessary costs resulting from inefficient or ineffective practices, systems, or controls.

Abuse is defined as excessive or improper use of a thing, or to use something in a manner contrary to the natural or legal rules for its use. Abuse can occur in financial or non-financial settings.

Return your assessment in this format:
{
    "riskLevel": number, // 1-5 where:
                        // 1: No significant concerns
                        // 2: Minor irregularities
                        // 3: Notable red flags
                        // 4: Serious concerns
                        // 5: Critical risk indicators
    "justification": "Brief explanation of the rating",
    "keyFactors": [
        "Key factor 1 that influenced the rating",
        "Key factor 2 that influenced the rating"
    ]
}`,
}; 