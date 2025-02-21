export interface Env {
    AWARDS_KV: KVNamespace;
    FIRECRAWL_API_KEY: string;
    OPENAI_API_KEY: string;
}

export interface SearchResult {
    url: string;
    title: string;
    content: string;
    score: number;
}

export interface TopicInfo {
    query: string;
    priority: number;
    urls: Set<string>;
    explored: boolean;
}

export interface ResearchQueue {
    topics: Map<string, TopicInfo>;
    visitedUrls: Set<string>;
}

export interface PageAnalysis {
    url: string;
    content: string;
    timestamp: string;
    reasoning: {
        initialThoughts: string;
        questions: string[];
        indicators: string[];
        riskLevel: number;
        justification: string;
    };
    extractedInfo: Record<string, unknown>;
    relevanceScore: number;
}

export interface ReasoningStep {
    timestamp: string;
    stage: string;
    reasoning: string;
    evidence: string[];
    confidence: number;
}

export interface AwardSearchContext {
    originalAwardId: string;
    findings: Array<{
        content: string;
        source: string;
        relevanceScore: number;
        analysis: PageAnalysis;
    }>;
    extractedInfo: Record<string, unknown>;
    reasoningChain: {
        steps: ReasoningStep[];
        finalConclusions: string[];
    };
    summary: string;
} 