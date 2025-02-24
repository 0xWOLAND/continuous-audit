import type { KVNamespace } from '@cloudflare/workers-types';

interface Award {
  "Award ID": string;
  "Recipient Name": string;
  "Award Amount": string;
  "Award Date": string;
  generated_internal_id: string;
}

interface AwardBasicInfo {
  recipientName: string;
  awardAmount: number;
  awardDate: string;
}

interface ProcessedAward {
  basicInfo: AwardBasicInfo;
  details: any;
  transactions: any[];
}

interface APIResponse<T> {
  results?: T[];
}

interface TransactionResponse {
  results?: any[];
}

export class USAspendingAPI {
  private readonly BASE_URL: string = "https://api.usaspending.gov/api/v2";
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async fetchAwards(): Promise<APIResponse<Award> | null> {
    const url = this.BASE_URL + "/search/spending_by_award/";
    const payload = {
      filters: {
        agencies: [
          {
            type: "awarding",
            tier: "toptier",
            name: "Department of Health and Human Services"
          }
        ],
        award_type_codes: ["A", "B", "C", "D"]
      },
      fields: ["Award ID", "Recipient Name", "Award Amount", "Award Date", "generated_internal_id"],
      order: "desc",
      limit: 100,
      page: 1
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json() as APIResponse<Award>;
    } catch (error) {
      console.error("Error fetching awards:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  async fetchAwardDetails(awardId: string) {
    const url = this.BASE_URL + `/awards/${awardId}/`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching award details for ${awardId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  async fetchTransactions(generatedInternalId: string) {
    const url = this.BASE_URL + "/transactions/";
    const allTransactions: any[] = [];
    let page = 1;

    while (true) {
      const payload = {
        award_id: generatedInternalId,
        limit: 100,
        page: page,
        sort: "action_date",
        order: "desc"
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json() as TransactionResponse;
        const transactions = data.results || [];

        if (transactions.length === 0) break;

        allTransactions.push(...transactions);

        if (transactions.length < 100) break;

        page++;
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
      } catch (error) {
        console.error(`Error fetching transactions for award ${generatedInternalId}:`, error instanceof Error ? error.message : error);
        break;
      }
    }

    return allTransactions;
  }

  async processSingleAward(award: Award) {
    const awardId = award["Award ID"];
    const generatedInternalId = award.generated_internal_id;

    if (!generatedInternalId) {
      console.error(`No generated_internal_id for award ${awardId}`);
      return null;
    }

    console.log(`\nProcessing award ${awardId}`);

    const awardDetails = await this.fetchAwardDetails(generatedInternalId) || {};
    const transactions = await this.fetchTransactions(generatedInternalId);

    try {
      const processedAward: ProcessedAward = {
        basicInfo: {
          recipientName: award["Recipient Name"],
          awardAmount: parseFloat(award["Award Amount"]) || 0,
          awardDate: award["Award Date"],
        },
        details: awardDetails,
        transactions: transactions
      };

      // Store in KV
      await this.kv.put(awardId, JSON.stringify(processedAward));

      return {
        award_info: award,
        award_details: awardDetails,
        transactions: transactions,
        transaction_count: transactions.length
      };

    } catch (error) {
      console.error(`Error storing award ${awardId}:`, error);
      return null;
    }
  }

  async processAwards() {
    const awardsData = await this.fetchAwards();
    if (!awardsData?.results) {
      console.error("No awards data retrieved");
      return;
    }

    const processedAwards = [];
    for (const award of awardsData.results) {
      const processedAward = await this.processSingleAward(award);
      if (processedAward) {
        processedAwards.push(processedAward);
      }
    }

    console.log("Processed awards:", processedAwards);
    return processedAwards;
  }

  async getAllAwards() {
    const { keys } = await this.kv.list();
    const awards: Record<string, ProcessedAward> = {};
    
    for (const key of keys) {
      const award = await this.kv.get<ProcessedAward>(key.name, 'json');
      if (award) {
        awards[key.name] = award;
      }
    }
    
    return awards;
  }

  async getAward(awardId: string) {
    return await this.kv.get<ProcessedAward>(awardId, 'json');
  }
} 