import { Env, SearchResult, AwardSearchContext, ResearchQueue, PageAnalysis } from '../types';
import FirecrawlApp, { CrawlStatusResponse, FirecrawlDocument } from '@mendable/firecrawl-js';
import { PROMPTS } from '../prompts';
import { withBackoff } from '../utils';
import { z } from 'zod';

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
        MAX_RESULTS_PER_QUERY: 3,
        MAX_PAGES_PER_SITE: 5,
        MAX_TOPICS: 10,
        MAX_URLS: 5,
        MAX_SEARCH_TIME_MS: 1000 * 60 * 15  
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
                const requestBody = {
                    model,
                    messages: [
                        { 
                            role: 'system', 
                            content: schema ? 'You must respond with a valid JSON object.' : undefined
                        },
                        { 
                            role: 'user', 
                            content: `${prompt}\n\nAnalyze this part of the content:\n${chunk}` 
                        }
                    ].filter(Boolean),
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

    private async crawlUrl(url: string): Promise<SearchResult[]> {
        try {
            const response = await withBackoff(
                () => this.firecrawl.crawlUrl(url, {
                    limit: DeepSearch.LIMITS.MAX_PAGES_PER_SITE,
                    scrapeOptions: { formats: ['markdown', 'html'] }
                })
            ) as CrawlStatusResponse;

            return response.success ? (response.data || []).map((result: FirecrawlDocument) => ({
                url: result.url || url,
                title: result.metadata?.title || '',
                content: result.markdown || result.html || '',
                score: 1
            })) : [];
        } catch (error) {
            console.error(`Crawl failed: ${url}`, error);
            return [];
        }
    }

    private async exploreTopics(): Promise<string[]> {
        const allUrls = new Set<string>();
        
        for (const [query, topic] of this.queue.topics) {
            if (topic.explored) continue;

            try {
                console.log(`Exploring topic: ${query}`);
                const response = await withBackoff(() => 
                    this.firecrawl.search(query, { limit: DeepSearch.LIMITS.MAX_RESULTS_PER_QUERY })
                );
                console.log(`Found ${response.data?.length} results for ${query}`);
                console.log(response.data);
                
                response.data?.forEach((result: FirecrawlDocument) => {
                    const url = result.url;
                    if (url && !this.queue.visitedUrls.has(url)) {
                        topic.urls.add(url);
                        allUrls.add(url);
                    }
                });
            } catch (error) {
                console.log(error);
                console.error(`Failed to explore topic: ${query}`, error);
            }
            topic.explored = true;
        }

        return Array.from(allUrls);
    }

    private addQuestions(questions: Array<{ question: string; priority: number }>) {
        console.log('\nAdding investigation questions...');
        for (const q of questions) {
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

    private async analyzeForFraud(content: string, awardId: string, awardDetails: any) {
        console.log(`\nAnalyzing content and award details for fraud indicators (Award: ${awardId})`);
        
        const enrichedContext = this.buildEnrichedContext(awardDetails);
        const combinedContent = `
Award Details:
${enrichedContext}

Related Content:
${content}
        `.trim();

        if (!combinedContent?.trim()) {
            return {
                initialThoughts: '',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'No content to analyze'
            };
        }

        const model = 'gpt-4-turbo-preview';
        
        const analysis = await this.analyze(
            PROMPTS.INITIAL_REASONING(awardId, enrichedContext), 
            combinedContent, 
            model,
            AnalysisResponse
        );

        if (!analysis) {
            console.log('Initial analysis failed');
            return {
                initialThoughts: 'Analysis failed',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'Initial analysis failed'
            };
        }

        this.addQuestions(analysis.questions.map(q => ({ 
            question: q,
            priority: analysis.riskLevel
        })));

        return analysis;
    }

    private buildEnrichedContext(awardDetails: any): string {
        const details = awardDetails?.details || {};
        const recipient = details?.recipient || {};
        const transactions = awardDetails?.transactions || [];
        
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

CONTRACT DETAILS:
- Competition: ${details.latest_transaction_contract_data?.extent_competed_description || 'Unknown'}
- Number of Offers: ${details.latest_transaction_contract_data?.number_of_offers_received || 'Unknown'}
- Contract Pricing Type: ${details.latest_transaction_contract_data?.type_of_contract_pricing_description || 'Unknown'}

TRANSACTION HISTORY:
${this.formatTransactions(transactions)}

PERFORMANCE LOCATION:
${this.formatLocation(details.place_of_performance)}
        `.trim();
    }

    private formatLocation(location: any): string {
        if (!location) return 'Unknown';
        return [
            location.address_line1,
            location.city_name,
            location.state_code,
            location.zip5,
            location.country_name
        ].filter(Boolean).join(', ');
    }

    private formatTransactions(transactions: any[]): string {
        if (!transactions?.length) return 'No transactions recorded';
        
        return transactions
            .map(t => `- ${t.action_date}: $${t.federal_action_obligation} - ${t.description || 'No description'}`)
            .join('\n');
    }

    async searchAward(awardId: string, awardDetails?: any): Promise<AwardSearchContext> {
        console.log(`\n=== Starting research for award: ${awardId} ===`);
        const startTime = Date.now();
        
        try {
            console.log('Step 1: Checking cache...');
            const existingResearch = await this.env.RESEARCH_KV.get(awardId);
            if (existingResearch) {
                return JSON.parse(existingResearch);
            }

            console.log('Step 2: Initializing search...');
            const context: AwardSearchContext = {
                originalAwardId: awardId,
                findings: [],
                extractedInfo: {},
                reasoningChain: { steps: [], finalConclusions: [] },
                summary: ''
            };

            console.log('Step 3: Adding search topics...');
            this.addTopic(awardId);
            if (awardDetails) {
                this.addInvestigationTopics(awardDetails);
            }

            console.log('Step 4: Starting URL exploration...');
            while (!this.shouldStopSearch(startTime)) {
                const urls = await this.exploreTopics();
                if (urls.length === 0) break;

                console.log('Processing discovered URLs...');
                await this.processUrls(urls, context, awardDetails);
            }

            console.log('Step 5: Generating final summary...');
            const summary = await this.analyze(
                'Summarize all findings and provide final conclusions about potential fraud risks.',
                JSON.stringify(context.findings),
                'gpt-4-turbo-preview'
            );

            console.log('Step 6: Storing results...');
            context.summary = summary;
            context.reasoningChain.finalConclusions = summary.split('\n').filter(Boolean);

            await this.env.RESEARCH_KV.put(
                awardId,
                JSON.stringify(context)
            );

            console.log('=== Research completed successfully ===');
            return context;

        } catch (error) {
            console.error('=== Research failed ===');
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                timeElapsed: Date.now() - startTime
            });
            throw error;
        }
    }

    private shouldStopSearch(startTime: number): boolean {
        const timeElapsed = Date.now() - startTime;
        const urlLimit = this.queue.visitedUrls.size >= DeepSearch.LIMITS.MAX_URLS;
        const timeLimit = timeElapsed > DeepSearch.LIMITS.MAX_SEARCH_TIME_MS;
        
        if (urlLimit || timeLimit) {
            console.log('Search stopping due to:', {
                timeElapsed,
                urlCount: this.queue.visitedUrls.size,
                hitUrlLimit: urlLimit,
                hitTimeLimit: timeLimit
            });
        }
        
        return urlLimit || timeLimit;
    }

    private async processUrls(urls: string[], context: AwardSearchContext, awardDetails?: any) {
        console.log(`\nProcessing ${urls.length} URLs...`);
        for (const url of urls) {
            if (this.queue.visitedUrls.has(url)) {
                console.log(`Skipping already visited URL: ${url}`);
                continue;
            }
            this.queue.visitedUrls.add(url);

            const pages = await this.crawlUrl(url);
            console.log(`Found ${pages.length} pages from ${url}`);
            await Promise.all(pages.map(page => this.processPage(page, context, awardDetails)));
        }
    }

    private async processPage(page: SearchResult, context: AwardSearchContext, awardDetails?: any) {
        const analysis = await this.analyzeForFraud(page.content, context.originalAwardId, awardDetails);
        
        if (analysis.riskLevel > 1) {
            console.log(`Risk level ${analysis.riskLevel}/5 detected`);
            const relevanceScore = analysis.riskLevel / 5;
            
            context.findings.push({
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
            });

            context.reasoningChain.steps.push({
                timestamp: new Date().toISOString(),
                stage: `analyzing ${page.url}`,
                reasoning: analysis.initialThoughts,
                evidence: analysis.indicators,
                confidence: relevanceScore
            });

            console.log('Updating KV store with new finding...');
            await this.env.RESEARCH_KV.put(
                context.originalAwardId,
                JSON.stringify(context)
            );
        } else {
            console.log(`Low risk level (${analysis.riskLevel}/5), skipping...`);
        }
    }

    private addTopic(query: string) {
        if (!this.queue.topics.has(query)) {
            this.queue.topics.set(query, {
                query,
                priority: 5,
                urls: new Set(),
                explored: false
            });
            console.log(`Added search: ${query}`);
        }
    }

    private addInvestigationTopics(awardDetails: any) {
        console.log('Adding investigation topics...');
        console.log(awardDetails);
        const details = awardDetails?.details || {};
        const recipient = details?.recipient || {};
        const executives = details?.executive_details || {};

        if (recipient.recipient_name) {
            const companyName = recipient.recipient_name;
            this.addTopic(`${companyName} fraud`);
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
            const industry = details.naics_hierarchy.base_code.description;
            this.addTopic(`${industry} ${recipient.recipient_name} violations`);
        }
    }
} 