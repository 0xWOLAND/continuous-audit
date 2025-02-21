import { Env, SearchResult, AwardSearchContext, ResearchQueue, PageAnalysis } from '../types';
import FirecrawlApp, { CrawlStatusResponse, FirecrawlDocument } from '@mendable/firecrawl-js';
import { InvestigationQuestions, PROMPTS, RiskAssessment } from '../prompts';
import { withBackoff } from '../utils';
import { z } from 'zod';

export class DeepSearch {
    private static readonly LIMITS = {
        MAX_RETRIES: 3,
        MAX_RESULTS_PER_QUERY: 5,
        MAX_PAGES_PER_SITE: 10,
        MAX_TOPICS: 20,          
        MAX_URLS: 10,            // Reduced from 50 to 10 for more focused research
        MAX_SEARCH_TIME_MS: 1000 * 60 * 15  // 15 minutes
    } as const;

    private queue: ResearchQueue;
    private firecrawl: FirecrawlApp;
    private visitedUrls: Set<string> = new Set();

    constructor(private env: Env) {
        console.log('Initializing DeepSearch with environment:', {
            hasFirecrawlKey: !!env.FIRECRAWL_API_KEY,
            hasOpenAIKey: !!env.OPENAI_API_KEY
        });
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
        const timeout = setTimeout(() => controller.abort(), 60000); // Increased to 60 seconds

        console.log(`\nAnalyzing with model ${model}`, {
            promptLength: prompt.length,
            contextLength: context.length,
            hasSchema: !!schema
        });

        const emptyResponse = schema ? { questions: [] } as any : '';
        
        if (!context?.trim()) {
            console.log('Empty context provided, returning empty response');
            return emptyResponse;
        }

        try {
            console.log('Making OpenAI API request...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model,
                    messages: [{ 
                        role: 'user', 
                        content: `${prompt}\n\n${context.slice(0, 6000)}` // Limit context to 6000 chars
                    }],
                    temperature: 0
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Analysis failed: ${response.status}`);
            }

            const responseData = await response.json() as { choices: Array<{ message: { content: string } }> };
            const content = responseData.choices[0].message.content;
            
            if (!content?.trim()) {
                console.log('Empty response from OpenAI');
                return emptyResponse;
            }

            console.log('Successfully received analysis response');
            if (schema) {
                return schema.parse(JSON.parse(content)) as any;
            }
            return content as any;
        } catch (error) {
            clearTimeout(timeout);
            console.error('Analysis error:', error);
            return emptyResponse;
        }
    }

    private async crawlUrl(url: string): Promise<SearchResult[]> {
        console.log(`\nCrawling URL: ${url}`);
        try {
            console.log('Making Firecrawl request...');
            const response = await withBackoff(
                () => this.firecrawl.crawlUrl(url, {
                    limit: DeepSearch.LIMITS.MAX_PAGES_PER_SITE,
                    scrapeOptions: { formats: ['markdown', 'html'] }
                })
            ) as CrawlStatusResponse;

            const results = response.success ? (response.data || []).map((result: FirecrawlDocument) => ({
                url: result.url || url,
                title: result.metadata?.title || '',
                content: result.markdown || result.html || '',
                score: 1
            })) : [];

            return results;
        } catch (error) {
            console.error(`Crawl failed: ${url}`, error);
            return [];
        }
    }

    private async exploreTopics(awardId: string): Promise<string[]> {
        const allUrls = new Set<string>();
        console.log(`\nExploring ${this.queue.topics.size} topics for award ${awardId}...`);
        
        for (const [query, topic] of this.queue.topics) {
            if (topic.explored) {
                console.log(`Skipping previously explored topic: ${query}`);
                continue;
            }

            console.log(`\nSearching topic: ${query}`);
            try {
                console.log('Making Firecrawl search request...');
                const response = await withBackoff(() => 
                    this.firecrawl.search(query, { limit: DeepSearch.LIMITS.MAX_RESULTS_PER_QUERY })
                );
                
                response.data?.forEach((result: FirecrawlDocument) => {
                    const url = result.url;
                    if (url && !this.queue.visitedUrls.has(url)) {
                        topic.urls.add(url);
                        allUrls.add(url);
                    }
                });
                console.log(`Found ${response.data?.length || 0} results for topic "${query}"`);
            } catch (error) {
                console.error(`Failed to explore topic: ${query}`, error);
            }
            topic.explored = true;
        }

        console.log(`Total unique URLs found: ${allUrls.size}`);
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
        
        // Construct enriched context from award details
        const enrichedContext = this.buildEnrichedContext(awardDetails);
        const combinedContent = `
Award Details:
${enrichedContext}

Related Content:
${content}
        `.trim();

        if (!combinedContent?.trim()) {
            console.log('Empty content provided, skipping analysis');
            return {
                initialThoughts: '',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'No content to analyze'
            };
        }

        const model = 'gpt-4-turbo-preview';
        
        console.log('Running initial parallel analyses...');
        const [initialThoughts, indicators] = await Promise.all([
            this.analyze(PROMPTS.INITIAL_REASONING(awardId, enrichedContext), combinedContent, model),
            this.analyze(PROMPTS.IDENTIFY_FRAUD_INDICATORS(awardId, enrichedContext), combinedContent, model)
        ]);

        if (!initialThoughts) {
            console.log('Initial analysis failed');
            return {
                initialThoughts: 'Analysis failed',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'Initial analysis failed'
            };
        }

        console.log('Running secondary parallel analyses...');
        const [questionsResponse, riskAssessment] = await Promise.all([
            this.analyze(
                PROMPTS.GENERATE_INVESTIGATION_QUESTIONS(awardId),
                `${initialThoughts}\n\nContext: ${content}`,
                model,
                InvestigationQuestions
            ),
            this.analyze(
                PROMPTS.ASSESS_FRAUD_RISK(awardId),
                `Initial Analysis: ${initialThoughts}\nIndicators: ${indicators}`,
                model,
                RiskAssessment
            )
        ]);

        this.addQuestions(questionsResponse.questions);

        console.log('Analysis complete:', {
            questionCount: questionsResponse.questions.length,
            indicatorCount: indicators.split('\n').filter(Boolean).length,
            riskLevel: riskAssessment.riskLevel
        });

        return {
            initialThoughts,
            questions: questionsResponse.questions.map(q => q.question),
            indicators: indicators.split('\n').filter(Boolean),
            riskLevel: riskAssessment.riskLevel,
            justification: riskAssessment.justification
        };
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
        console.log(`\nStarting award search for ${awardId}`);
        const startTime = Date.now();
        const context: AwardSearchContext = {
            originalAwardId: awardId,
            findings: [],
            extractedInfo: {},
            reasoningChain: { steps: [], finalConclusions: [] },
            summary: ''
        };

        try {
            console.log('Checking for existing research...');
            const existingResearch = await this.env.AWARDS_KV.get(`research:${awardId}`);
            if (existingResearch) {
                console.log('Found existing research, returning cached results');
                return JSON.parse(existingResearch);
            }

            console.log('Starting new research...');
            this.addTopic(awardId);

            // Add specific investigation topics based on award details
            if (awardDetails) {
                this.addInvestigationTopics(awardDetails);
            }

            while (!this.shouldStopSearch(startTime)) {
                const urls = await this.exploreTopics(awardId);
                if (urls.length === 0) {
                    console.log('No more URLs to explore');
                    break;
                }

                await this.processUrls(urls, context, awardDetails);
            }

            console.log('Generating final summary...');
            const summary = await this.analyze(
                'Summarize all findings and provide final conclusions about potential fraud risks.',
                JSON.stringify(context.findings),
                'gpt-4-turbo-preview'
            );
            context.summary = summary;
            context.reasoningChain.finalConclusions = summary.split('\n').filter(Boolean);

            console.log('Storing research results...');
            await this.env.AWARDS_KV.put(
                `research:${awardId}`,
                JSON.stringify(context)
            );

            console.log('Search completed successfully');
            return context;
        } catch (error) {
            console.error('Search failed:', error);
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
            console.log(`Processing ${pages.length} pages from ${url}`);
            await Promise.all(pages.map(page => this.processPage(page, context, awardDetails)));
        }
    }

    private async processPage(page: SearchResult, context: AwardSearchContext, awardDetails?: any) {
        console.log(`\nProcessing page: ${page.url}`);
        const analysis = await this.analyzeForFraud(page.content, context.originalAwardId, awardDetails);
        
        if (analysis.riskLevel > 1) {
            console.log(`Found significant risk (${analysis.riskLevel}/5) at ${page.url}`);
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
            await this.env.AWARDS_KV.put(
                `research:${context.originalAwardId}`,
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
                priority: 5, // High priority for initial search queries
                urls: new Set(),
                explored: false
            });
            console.log(`Added search: ${query}`);
        }
    }

    private addInvestigationTopics(awardDetails: any) {
        const details = awardDetails?.details || {};
        const recipient = details?.recipient || {};

        // Add company-specific searches
        if (recipient.recipient_name) {
            this.addTopic(`${recipient.recipient_name} contract fraud investigations`);
            this.addTopic(`${recipient.recipient_name} performance history government contracts`);
        }

        if (recipient.parent_recipient_name && recipient.parent_recipient_name !== recipient.recipient_name) {
            this.addTopic(`${recipient.parent_recipient_name} subsidiary investigations`);
        }

        // Add location-based searches
        if (recipient.location?.city_name && recipient.location?.state_code) {
            this.addTopic(`government contractor investigations ${recipient.location.city_name} ${recipient.location.state_code}`);
        }

        // Add industry-specific searches
        if (details.naics_hierarchy?.base_code?.description) {
            this.addTopic(`contract fraud ${details.naics_hierarchy.base_code.description}`);
        }
    }

    getVisitedUrls(): Set<string> {
        return this.visitedUrls;
    }
} 