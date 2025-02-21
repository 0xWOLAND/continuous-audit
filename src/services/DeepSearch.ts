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
        MAX_URLS: 50,            
        MAX_SEARCH_TIME_MS: 1000 * 60 * 15  // 15 minutes
    } as const;

    private queue: ResearchQueue;
    private firecrawl: FirecrawlApp;
    private visitedUrls: Set<string> = new Set();

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
        const emptyResponse = schema ? { questions: [] } as any : '';
        
        if (!context?.trim()) {
            return emptyResponse;
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { 
                            role: 'system', 
                            content: schema ? `Respond with a JSON object. ${prompt}` : prompt 
                        },
                        { role: 'user', content: context.slice(0, 15000) }
                    ],
                    temperature: 0.1,
                    response_format: schema ? { type: 'json_object' } : undefined
                })
            });

            if (!response.ok) {
                throw new Error(`Analysis failed: ${response.status}`);
            }

            const responseData = await response.json() as { choices: Array<{ message: { content: string } }> };
            const content = responseData.choices[0].message.content;
            
            if (!content?.trim()) {
                return emptyResponse;
            }

            if (schema) {
                return schema.parse(JSON.parse(content)) as any;
            }
            return content as any;
        } catch (error) {
            console.error('Analysis error:', error);
            return emptyResponse;
        }
    }

    private async crawlUrl(url: string): Promise<SearchResult[]> {
        console.log(`\nCrawling URL: ${url}`);
        try {
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

            console.log(`Found ${results.length} pages at ${url}`);
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
            } catch (error) {
                console.error(`Failed to explore topic: ${query}`, error);
            }
            topic.explored = true;
        }

        return Array.from(allUrls);
    }

    private addQuestions(questions: Array<{ question: string; priority: number }>) {
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

    private async analyzeForFraud(content: string, awardId: string) {
        if (!content?.trim()) {
            return {
                initialThoughts: '',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'No content to analyze'
            };
        }

        const model = 'gpt-4-turbo-preview';
        
        // Run initial analysis and indicators in parallel
        const [initialThoughts, indicators] = await Promise.all([
            this.analyze(PROMPTS.INITIAL_REASONING(awardId), content, model),
            this.analyze(PROMPTS.IDENTIFY_FRAUD_INDICATORS(awardId), content, model)
        ]);

        if (!initialThoughts) {
            return {
                initialThoughts: 'Analysis failed',
                questions: [],
                indicators: [],
                riskLevel: 1,
                justification: 'Initial analysis failed'
            };
        }

        // Run remaining analyses in parallel
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

        return {
            initialThoughts,
            questions: questionsResponse.questions.map(q => q.question),
            indicators: indicators.split('\n').filter(Boolean),
            riskLevel: riskAssessment.riskLevel,
            justification: riskAssessment.justification
        };
    }

    async searchAward(awardId: string): Promise<AwardSearchContext> {
        const startTime = Date.now();
        const context: AwardSearchContext = {
            originalAwardId: awardId,
            findings: [],
            extractedInfo: {},
            reasoningChain: { steps: [], finalConclusions: [] },
            summary: ''
        };

        try {
            // Start with the award ID as initial topic
            this.addTopic(awardId);

            while (!this.shouldStopSearch(startTime)) {
                const urls = await this.exploreTopics(awardId);
                if (urls.length === 0) break;

                await this.processUrls(urls, context);
            }

            // Generate final summary
            const summary = await this.analyze(
                'Summarize all findings and provide final conclusions about potential fraud risks.',
                JSON.stringify(context.findings),
                'gpt-4-turbo-preview'
            );
            context.summary = summary;
            context.reasoningChain.finalConclusions = summary.split('\n').filter(Boolean);

            return context;
        } catch (error) {
            console.error('Search failed:', error);
            throw error;
        }
    }

    private shouldStopSearch(startTime: number): boolean {
        return Date.now() - startTime > DeepSearch.LIMITS.MAX_SEARCH_TIME_MS ||
               this.queue.visitedUrls.size >= DeepSearch.LIMITS.MAX_URLS;
    }

    private async processUrls(urls: string[], context: AwardSearchContext) {
        for (const url of urls) {
            if (this.queue.visitedUrls.has(url)) continue;
            this.queue.visitedUrls.add(url);

            const pages = await this.crawlUrl(url);
            await Promise.all(pages.map(page => this.processPage(page, context)));
        }
    }

    private async processPage(page: SearchResult, context: AwardSearchContext) {
        const analysis = await this.analyzeForFraud(page.content, context.originalAwardId);
        
        if (analysis.riskLevel > 1) {
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

    getVisitedUrls(): Set<string> {
        return this.visitedUrls;
    }
} 