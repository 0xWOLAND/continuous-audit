import { Env, SearchResult, AwardSearchContext, ResearchQueue, PageAnalysis } from '../types';
import FirecrawlApp, { CrawlStatusResponse, FirecrawlDocument } from '@mendable/firecrawl-js';
import { PROMPTS } from '../prompts';
import { withBackoff } from '../utils';
import { z } from 'zod';

// Schema for analysis responses
const AnalysisResponse = z.object({
    initialThoughts: z.string(),
    questions: z.array(z.string()),
    indicators: z.array(z.string()),
    riskLevel: z.number().min(1).max(5),
    justification: z.string()
});

export class DeepSearch {
    private static readonly LIMITS = {
        MAX_RETRIES: 3,
        MAX_RESULTS_PER_QUERY: 5,
        MAX_PAGES_PER_SITE: 5,
        MAX_TOPICS: 15,
        MAX_URLS: 10,
        MAX_SEARCH_TIME_MS: 1000 * 60 * 20,
        MIN_FINDINGS_THRESHOLD: 2
    } as const;

    private queue: ResearchQueue;
    private firecrawl: FirecrawlApp;

    constructor(private env: Env) {
        this.firecrawl = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });
        this.queue = {
            topics: new Map(),
            visitedUrls: new Set(),
        };
    }

    private async analyze<T extends z.ZodType | undefined>(
        prompt: string, 
        context: string, 
        model = 'gpt-4-turbo-preview',
        schema?: T
    ): Promise<T extends z.ZodType ? z.infer<T> : string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000);

        const chunks = this.splitIntoChunks(context, 3000, 500);

        try {
            const results = await Promise.all(chunks.map(async (chunk, i) => {
                const systemMessage = schema 
                    ? { role: 'system', content: 'You must respond with a valid JSON object.' }
                    : undefined;

                const requestBody = {
                    model,
                    messages: [
                        ...(systemMessage ? [systemMessage] : []),
                        { 
                            role: 'user', 
                            content: `${prompt}\n\nAnalyze this part of the content:\n${chunk}` 
                        }
                    ],
                    temperature: 0,
                    response_format: schema ? { type: 'json_object' } : undefined
                };

                const response = await withBackoff(async () => {
                    const res = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
                        },
                        body: JSON.stringify(requestBody),
                        signal: controller.signal
                    });

                    if (!res.ok) {
                        const error = await res.text();
                        console.error(`OpenAI API error (${res.status}):`, error);
                        throw new Error(`Analysis failed: ${res.status}`);
                    }

                    return res.json();
                });

                return response.choices[0].message.content;
            }));

            clearTimeout(timeout);

            const combinedContent = results.join('\n');
            if (schema) {
                try {
                    return schema.parse(JSON.parse(results[0])) as any;
                } catch (error) {
                    console.error('Failed to parse JSON response:', combinedContent);
                    throw error;
                }
            }
            return combinedContent as any;

        } catch (error) {
            clearTimeout(timeout);
            console.error('Analysis error:', error);
            return schema ? { questions: [] } as any : '';
        }
    }

    private splitIntoChunks(text: string, size: number, overlap: number): string[] {
        const chunks: string[] = [];
        let index = 0;
        while (index < text.length) {
            const chunk = text.slice(index, index + size);
            chunks.push(chunk);
            index += size - overlap;
        }
        return chunks;
    }

    private async crawlUrl(url: string, awardId: string): Promise<SearchResult[]> {
        try {
            const response = await withBackoff(
                () => this.firecrawl.crawlUrl(url, {
                    limit: DeepSearch.LIMITS.MAX_PAGES_PER_SITE,
                    scrapeOptions: { formats: ['markdown', 'html'] }
                }),
            ) as CrawlStatusResponse;

            if (!response.success) return [];

            return (response.data || []).map((result: FirecrawlDocument) => {
                const content = result.markdown || result.html || '';
                if (!content.includes(awardId) && !content.toLowerCase().includes('contract')) return null;
                return {
                    url: result.url || url,
                    title: result.metadata?.title || '',
                    content,
                    score: this.calculateRelevanceScore(content, awardId)
                };
            }).filter(Boolean) as SearchResult[];
        } catch (error) {
            console.error(`Crawl failed: ${url}`, error);
            return [];
        }
    }

    private calculateRelevanceScore(content: string, awardId: string): number {
        const keywords = [awardId, 'contract', 'fraud', 'award', 'recipient'];
        return keywords.reduce((score, keyword) => 
            score + (content.toLowerCase().includes(keyword.toLowerCase()) ? 0.2 : 0), 0);
    }

    private async exploreTopics(): Promise<string[]> {
        const allUrls = new Set<string>();
        for (const [query, topic] of this.queue.topics) {
            if (topic.explored) continue;

            try {
                console.log(`Exploring topic: ${query}`);
                const response = await withBackoff(() => 
                    this.firecrawl.search(query, { limit: DeepSearch.LIMITS.MAX_RESULTS_PER_QUERY }),
                );
                console.log(`Found ${response.data?.length} results for ${query}`);

                response.data?.forEach((result: FirecrawlDocument) => {
                    const url = result.url;
                    if (url && !this.queue.visitedUrls.has(url)) {
                        topic.urls.add(url);
                        allUrls.add(url);
                    }
                });
                topic.explored = true;
            } catch (error) {
                console.error(`Failed to explore topic: ${query}`, error);
            }
        }
        return Array.from(allUrls);
    }

    private addQuestions(questions: Array<{ question: string; priority: number }>) {
        console.log('\nAdding investigation questions...');
        for (const q of questions) {
            if (this.queue.topics.size >= DeepSearch.LIMITS.MAX_TOPICS) break;
            if (!this.queue.topics.has(q.question)) {
                this.queue.topics.set(q.question, {
                    query: q.question,
                    priority: q.priority,
                    urls: new Set(),
                    explored: false
                });
                console.log(`Added investigation: [P${q.priority}] ${q.question}`);
            }
        }
    }

    // New method to analyze transaction history
    private async analyzeTransactionHistory(awardId: string, transactions: any[]): Promise<string> {
        const transactionContext = this.formatTransactions(transactions);
        if (!transactionContext || transactionContext === 'No transactions recorded') {
            return 'No transaction data available';
        }

        console.log("Transaction Context:", transactionContext);
        const prompt = `
Analyze the following transaction history for award ${awardId} for suspicious patterns that might indicate fraud.
Consider:
1. Unusual timing (e.g., end-of-year spikes)
2. Negating transactions or reversals
3. Large, unexplained amounts
4. Frequent modifications

Provide your analysis in a clear, detailed format.

Transaction History:
${transactionContext}
        `.trim();

        try {
            const analysisText = await this.analyze(prompt, transactionContext, 'gpt-4-turbo-preview');
            console.log("Transaction Analysis:", analysisText);
            return analysisText || 'Transaction analysis failed';
        } catch (error) {
            console.error("Error in transaction analysis:", error);
            return 'Transaction analysis failed with error';
        }
    }

    private async analyzeForFraud(content: string, awardId: string, awardDetails: any): Promise<z.infer<typeof AnalysisResponse>> {
        console.log(`\nAnalyzing content for fraud indicators (Award: ${awardId})`);
        const enrichedContext = this.buildEnrichedContext(awardDetails);
        console.log('awardDetails:', awardDetails);
        const transactions = awardDetails?.transactions || [];
        console.log('Transactions:', transactions);
        const transactionAnalysis = await this.analyzeTransactionHistory(awardId, transactions);
        console.log('Transaction Analysis:', transactionAnalysis);

        const combinedContent = `
Award Details:
${enrichedContext}

Related Content:
${content}

Transaction Analysis:
${transactionAnalysis}
        `.trim();

        if (!combinedContent) {
            return { initialThoughts: '', questions: [], indicators: [], riskLevel: 1, justification: 'No content to analyze' };
        }

        const analysis = await this.analyze(PROMPTS.INITIAL_REASONING(awardId, enrichedContext), combinedContent, 'gpt-4-turbo-preview', AnalysisResponse);
        if (!analysis || !analysis.riskLevel) {
            console.log('Analysis failed or returned invalid result');
            return { initialThoughts: 'Analysis failed', questions: [], indicators: [], riskLevel: 1, justification: 'Analysis process failed' };
        }

        // Extract any bullet points or numbered items from transaction analysis as indicators
        const transactionIndicators = transactionAnalysis
            .split('\n')
            .filter(line => line.trim().match(/^[-•*\d]/))
            .map(line => line.replace(/^[-•*\d.]\s*/, '').trim())
            .filter(line => line.length > 0);

        analysis.indicators.push(...transactionIndicators);
        analysis.justification += `\n\nTransaction Analysis:\n${transactionAnalysis}`;

        this.addQuestions(analysis.questions.map(q => ({ question: q, priority: analysis.riskLevel })));
        return analysis;
    }

    // Modified to exclude transaction history and contract details
    private buildEnrichedContext(awardDetails: any): string {
        const details = awardDetails?.details || {};
        const recipient = details?.recipient || {};
        return `
AWARD OVERVIEW:
- Award Amount: $${details.total_obligation || 0}
- Date Signed: ${details.date_signed || 'Unknown'}
- Type: ${details.type_description || 'Unknown'}
- Description: ${details.description || 'No description'}

RECIPIENT INFORMATION:
- Name: ${recipient.recipient_name || 'Unknown'}
- Parent Company: ${recipient.parent_recipient_name || 'None'}
- Business Categories: ${(recipient.business_categories || []).join(', ')}
- Location: ${this.formatLocation(recipient.location)}

PERFORMANCE LOCATION:
${this.formatLocation(details.place_of_performance)}
        `.trim();
    }

    private formatLocation(location: any): string {
        return location ? [location.address_line1, location.city_name, location.state_code, location.zip5, location.country_name].filter(Boolean).join(', ') : 'Unknown';
    }

    private formatTransactions(transactions: any[]): string {
        return transactions?.length ? transactions.map(t => `- ${t.action_date}: $${t.federal_action_obligation} - ${t.description || 'No description'}`).join('\n') : 'No transactions recorded';
    }

    async searchAward(awardId: string, awardDetails?: any): Promise<AwardSearchContext> {
        console.log(`\n=== Starting research for award: ${awardId} ===`);
        const startTime = Date.now();

        try {
            const cached = await this.env.RESEARCH_KV.get(awardId);
            if (cached) {
                console.log('Returning cached result');
                return JSON.parse(cached);
            }

            const context: AwardSearchContext = {
                originalAwardId: awardId,
                findings: [],
                extractedInfo: {},
                reasoningChain: { steps: [], finalConclusions: [] },
                summary: ''
            };

            this.addTopic(awardId);
            if (awardDetails) this.addInvestigationTopics(awardDetails);

            while (!this.shouldStopSearch(startTime, context)) {
                const urls = await this.exploreTopics();
                if (urls.length === 0) break;
                await this.processUrls(urls, context, awardDetails);
            }

            const summary = await this.analyze(
                'Summarize all findings and provide final conclusions about potential fraud risks.',
                JSON.stringify(context.findings),
                'gpt-4-turbo-preview'
            );

            context.summary = summary || 'No conclusive summary generated';
            context.reasoningChain.finalConclusions = summary ? summary.split('\n').filter(Boolean) : ['Analysis incomplete'];

            await this.env.RESEARCH_KV.put(awardId, JSON.stringify(context));
            console.log('=== Research completed successfully ===');
            return context;

        } catch (error) {
            console.error('=== Research failed ===', { message: error.message, stack: error.stack, timeElapsed: Date.now() - startTime });
            throw error;
        }
    }

    private shouldStopSearch(startTime: number, context: AwardSearchContext): boolean {
        const timeElapsed = Date.now() - startTime;
        const urlLimit = this.queue.visitedUrls.size >= DeepSearch.LIMITS.MAX_URLS;
        const timeLimit = timeElapsed > DeepSearch.LIMITS.MAX_SEARCH_TIME_MS;
        const topicExhausted = Array.from(this.queue.topics.values()).every(t => t.explored);
        const findingsSufficient = context.findings.length >= DeepSearch.LIMITS.MIN_FINDINGS_THRESHOLD;

        if (urlLimit || timeLimit || (topicExhausted && findingsSufficient)) {
            console.log('Search stopping due to:', { timeElapsed, urlCount: this.queue.visitedUrls.size, topicExhausted, findingsCount: context.findings.length });
            return true;
        }
        return false;
    }

    private async processUrls(urls: string[], context: AwardSearchContext, awardDetails?: any) {
        console.log(`\nProcessing ${urls.length} URLs...`);
        const chunkSize = 3;
        for (let i = 0; i < urls.length; i += chunkSize) {
            const chunk = urls.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async url => {
                if (this.queue.visitedUrls.has(url)) {
                    console.log(`Skipping already visited URL: ${url}`);
                    return;
                }
                this.queue.visitedUrls.add(url);
                const pages = await this.crawlUrl(url, context.originalAwardId);
                console.log(`Found ${pages.length} pages from ${url}`);
                await Promise.all(pages.map(page => this.processPage(page, context, awardDetails)));
            }));
        }
    }

    private async processPage(page: SearchResult, context: AwardSearchContext, awardDetails?: any) {
        const analysis = await this.analyzeForFraud(page.content, context.originalAwardId, awardDetails);

        if (analysis.riskLevel > 1) {
            console.log(`Risk level ${analysis.riskLevel}/5 detected at ${page.url}`);
            const relevanceScore = Math.min(1, analysis.riskLevel / 5 * page.score);

            const finding = {
                content: page.content,
                source: page.url,
                relevanceScore,
                analysis: {
                    url: page.url,
                    content: page.content,
                    timestamp: new Date().toISOString(),
                    reasoning: analysis,
                    extractedInfo: {},
                    relevanceScore
                }
            };

            context.findings.push(finding);
            context.reasoningChain.steps.push({
                timestamp: new Date().toISOString(),
                stage: `analyzing ${page.url}`,
                reasoning: analysis.initialThoughts,
                evidence: analysis.indicators,
                confidence: relevanceScore
            });

            await this.env.RESEARCH_KV.put(context.originalAwardId, JSON.stringify(context));
        } else {
            console.log(`Low risk level (${analysis.riskLevel}/5) at ${page.url}, skipping...`);
        }
    }

    private addTopic(query: string) {
        if (this.queue.topics.size < DeepSearch.LIMITS.MAX_TOPICS && !this.queue.topics.has(query)) {
            this.queue.topics.set(query, { query, priority: 5, urls: new Set(), explored: false });
            console.log(`Added search: ${query}`);
        }
    }

    private addInvestigationTopics(awardDetails: any) {
        console.log('Adding investigation topics...');
        const details = awardDetails?.details || {};
        const recipient = details?.recipient || {};
        const executives = details?.executive_details || {};

        if (recipient.recipient_name) {
            const companyName = recipient.recipient_name;
            this.addTopic(`${companyName} fraud site:*.gov | site:*.org -inurl:(signup | login)`);
            this.addTopic(`${companyName} investigation`);
            this.addTopic(`${companyName} lawsuit`);
            this.addTopic(`${companyName} debarment`);
            if (recipient.location?.city_name && recipient.location?.state_code) {
                this.addTopic(`${companyName} ${recipient.location.city_name} ${recipient.location.state_code} violations`);
            }
        }

        if (executives.officers) {
            for (const officer of executives.officers) {
                if (officer.name) {
                    this.addTopic(`${officer.name} ${recipient.recipient_name} fraud`);
                    this.addTopic(`${officer.name} contractor investigation`);
                }
            }
        }

        if (recipient.parent_recipient_name && recipient.parent_recipient_name !== recipient.recipient_name) {
            const parentName = recipient.parent_recipient_name;
            this.addTopic(`${parentName} fraud`);
            this.addTopic(`${parentName} subsidiaries investigation`);
        }

        if (details.risk_score > 3 && details.naics_hierarchy?.base_code?.description) {
            this.addTopic(`${details.naics_hierarchy.base_code.description} ${recipient.recipient_name} violations`);
        }
    }
}