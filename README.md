# Federal Contract Fraud Detection System

An AI-powered system for detecting potential fraud indicators in federal contract awards.

## API Endpoints

### Awards
- `POST /fetch-awards` - Manually trigger fetching of new awards from USASpending.gov
- `GET /awards` - Get all awards in the system
- `GET /awards/:awardId` - Get details for a specific award

### Research
- `POST /awards/:awardId/research` - Trigger fraud analysis for a specific award
- `GET /awards/:awardId/research` - Get research results for a specific award

## Scheduled Tasks
The system runs every 6 hours to:
1. Fetch new awards from USASpending.gov
2. Automatically research any awards that haven't been analyzed
3. Store results in KV storage

## Example Analysis

```
Starting research for award: HHSS28342003T

Research Results:
================

Highest Risk Level: 2/5

Summary: 

Findings: 1

Finding 1:
Source: https://www.usaspending.gov/award/CONT_AWD_HHSS28342003T_7522_HHSS283201200038I_7522
Risk Level: 2/5
Relevance: 0.4
Analysis: {
  initialThoughts: 'Based on the provided award information and related content about award HHSS28342003T, here are some initial thoughts regarding potential fraud indicators categorized by the specific risk factors mentioned:\n' +
    '\n' +
    '### 1. Unusual Pricing or Competition Patterns\n' +
    '- The contract was awarded after a full and open competition with only 2 offers received. This in itself is not unusual, but the competitiveness of the process could be scrutinized depending on the complexity and niche of the services required.\n' +
    '- The contract pricing type is "Cost Plus Award Fee," which can sometimes be a risk factor if not closely monitored due to the potential for cost overruns and less incentive for the contractor to control costs.\n' +
    '\n' +
    '### 2. Shell Company Indicators\n' +
    "- The recipient, JBS International, Inc., does not immediately present indicators of being a shell company based on the information provided. It has a physical address and is designated as a woman-owned business, not designated a small business. Further investigation into the company's history, ownership structure, and financial health would be necessary to rule out this risk.\n" +
    '\n' +
    '### 3. Geographic Risk Factors\n' +
    '- The recipient is located in Silver Spring, MD, and the performance location is in Rockville, MD. Both locations are within the United States and in proximity to each other, which does not inherently present geographic risk factors. However, understanding the nature of the services and whether they could be effectively delivered from this location might be relevant.\n' +
    '\n' +
    '### 4. Contract Modification Patterns\n' +
    '- There is a modification listed with a $0 amount for a change in the project officer. While changes in personnel are not uncommon, any pattern of frequent modifications, especially those involving financial adjustments, would warrant closer examination.\n' +
    '\n' +
    '### 5. Relationship with Other Contractors\n' +
    '- The related content mentions another recipient, "ADVOCATES FOR HUMAN POTENTIAL INC," under a related award. Investigating the relationship between JBS International, Inc., and any other contractors, especially if subcontracting arrangements exist, would be important to identify any potential conflicts of interest or collusion.\n' +
    '\n' +
    '### 6. History of Performance Issues\n' +
    "- There is no direct information provided about JBS International, Inc.'s history of performance issues. A thorough review of past contracts, performance evaluations, and any corrective actions taken would be necessary to assess this risk.\n" +
    '\n' +
    '### 7. Unusual Transaction Patterns\n' +
    '- The transaction history shows a significant payment ($816,494) on 2010-04-19, which is a substantial portion of the total award amount. While not unusual in itself, the pattern and justification of payments, especially in cost-plus contracts, should be closely monitored to ensure they align with project milestones and delivered value.\n' +
    '\n' +
    '### Conclusion\n' +
    "Based on the initial review, there are no glaring indicators of fraud, but several areas, such as contract modification patterns, the relationship with other contractors, and the justification of the cost-plus award fee structure, would benefit from a deeper investigation to fully assess the risk of fraud. Further, verifying the legitimacy and performance history of JBS International, Inc., along with a detailed review of the contract's financial transactions, would be prudent steps in a comprehensive fraud risk assessment.",
  questions: [],
  indicators: [
    'Based on the provided information, here are the potential red flags or suspicious patterns identified in relation to the award HHSS28342003T:',
    "1. **Unusual Contract Modifications or Pricing**: The transaction history shows a modification with a $0 amount on 2011-01-13 for a change in the project officer and another $0 modification on 10/16/2024 for closeout. While $0 modifications are not inherently suspicious, they can sometimes indicate administrative adjustments that could mask more substantive changes or irregularities. However, without more context, it's difficult to definitively classify these as red flags.",
    '2. **Shell Company Characteristics**: There is no direct evidence provided that suggests JBS International, Inc., or Advocates for Human Potential Inc., exhibit shell company characteristics. Both entities have physical addresses and a history of government contracts, which reduces the likelihood of them being shell companies.',
    '3. **Multiple Awards to the Same Contractor**: The information provided does not indicate multiple awards to the same contractor within the context of this specific award. However, further investigation into the full history of awards to these entities would be necessary to identify any patterns of concern.',
    "4. **Geographic Anomalies**: The performance location is in Rockville, MD, while the recipient is located in Silver Spring, MD, which are relatively close, reducing concerns of geographic anomalies. The related content mentions a recipient in Sudbury, MA, which could be considered a geographic anomaly if the work is expected to be performed near the awarding agency or if the distance impacts the project's logistics and costs. However, this might also reflect a legitimate business operation spread across multiple locations.",
    "5. **Unusual Subcontracting Patterns**: There is no detailed information provided about subcontracting patterns for this award. Without data on subcontractors, their relationships to the primary contractor, and the distribution of work, it's challenging to identify any unusual patterns.",
    "6. **Suspicious Timing of Awards/Modifications**: The timing of the modifications does not immediately suggest suspicious activity without further context regarding the project's lifecycle and the reasons for these modifications.",
    '7. **Relationship with Government Officials**: The provided information does not include any details on relationships between contractors and government officials. Such relationships would require additional investigation to uncover potential conflicts of interest or undue influence.',
    '8. **History of Investigations or Complaints**: The content does not mention any history of investigations or complaints against the contractors involved. This aspect would require external research to determine if there have been any relevant legal or compliance issues.',
    'In summary, while there are a few areas where additional information could potentially reveal concerns (such as the $0 modifications and the lack of detail on subcontracting patterns), the provided data does not conclusively indicate fraudulent activity without further investigation.'
  ],
  riskLevel: 2,
  justification: "Based on the initial analysis, there are minor irregularities that could warrant further investigation but do not conclusively indicate fraud at this stage. The contract modifications with $0 amounts, while not inherently suspicious, could mask more substantive changes or irregularities if not properly documented and justified. The proximity of the performance location to the recipient's address does not present a geographic risk but does highlight the need for understanding the nature of the services provided and their delivery mechanisms. The significant payment made on 2010-04-19, without context on the payment's alignment with project milestones, raises questions about the justification of costs in a 'Cost Plus Award Fee' contract. However, without more detailed information on these aspects, these concerns remain speculative."
}

Reasoning Chain:

Step 1:
Stage: analyzing https://www.usaspending.gov/award/CONT_AWD_HHSS28342003T_7522_HHSS283201200038I_7522
Reasoning: Based on the provided award information and related content about award HHSS28342003T, here are some initial thoughts regarding potential fraud indicators categorized by the specific risk factors mentioned:

### 1. Unusual Pricing or Competition Patterns
- The contract was awarded after a full and open competition with only 2 offers received. This in itself is not unusual, but the competitiveness of the process could be scrutinized depending on the complexity and niche of the services required.
- The contract pricing type is "Cost Plus Award Fee," which can sometimes be a risk factor if not closely monitored due to the potential for cost overruns and less incentive for the contractor to control costs.

### 2. Shell Company Indicators
- The recipient, JBS International, Inc., does not immediately present indicators of being a shell company based on the information provided. It has a physical address and is designated as a woman-owned business, not designated a small business. Further investigation into the company's history, ownership structure, and financial health would be necessary to rule out this risk.

### 3. Geographic Risk Factors
- The recipient is located in Silver Spring, MD, and the performance location is in Rockville, MD. Both locations are within the United States and in proximity to each other, which does not inherently present geographic risk factors. However, understanding the nature of the services and whether they could be effectively delivered from this location might be relevant.

### 4. Contract Modification Patterns
- There is a modification listed with a $0 amount for a change in the project officer. While changes in personnel are not uncommon, any pattern of frequent modifications, especially those involving financial adjustments, would warrant closer examination.

### 5. Relationship with Other Contractors
- The related content mentions another recipient, "ADVOCATES FOR HUMAN POTENTIAL INC," under a related award. Investigating the relationship between JBS International, Inc., and any other contractors, especially if subcontracting arrangements exist, would be important to identify any potential conflicts of interest or collusion.

### 6. History of Performance Issues
- There is no direct information provided about JBS International, Inc.'s history of performance issues. A thorough review of past contracts, performance evaluations, and any corrective actions taken would be necessary to assess this risk.

### 7. Unusual Transaction Patterns
- The transaction history shows a significant payment ($816,494) on 2010-04-19, which is a substantial portion of the total award amount. While not unusual in itself, the pattern and justification of payments, especially in cost-plus contracts, should be closely monitored to ensure they align with project milestones and delivered value.

### Conclusion
Based on the initial review, there are no glaring indicators of fraud, but several areas, such as contract modification patterns, the relationship with other contractors, and the justification of the cost-plus award fee structure, would benefit from a deeper investigation to fully assess the risk of fraud. Further, verifying the legitimacy and performance history of JBS International, Inc., along with a detailed review of the contract's financial transactions, would be prudent steps in a comprehensive fraud risk assessment.
Confidence: 0.4

Final Conclusions: