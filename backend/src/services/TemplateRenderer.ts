import { ProcessedAward } from '../types';

export class TemplateRenderer {
    private template: string;
    private styles: string;

    constructor() {
        // These would typically be read from files, but for Cloudflare Workers
        // we'll keep them in memory since we can't read from filesystem
        this.styles = `body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            color: #2c3e50;
            text-align: center;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background-color: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #2c3e50;
            color: white;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .amount {
            text-align: right;
        }
        .award-id {
            font-family: monospace;
        }
        .no-data {
            text-align: center;
            padding: 20px;
            color: #666;
        }`;

        this.template = `<!DOCTYPE html>
        <html>
        <head>
            <title>Federal Contract Fraud Detection System</title>
            <style>
                {{styles}}
            </style>
        </head>
        <body>
            <h1>Federal Contract Fraud Detection System</h1>
            <table>
                <thead>
                    <tr>
                        <th>Award ID</th>
                        <th>Recipient</th>
                        <th>Amount</th>
                        <th>Award Date</th>
                    </tr>
                </thead>
                <tbody>
                    {{tableRows}}
                </tbody>
            </table>
        </body>
        </html>`;
    }

    private generateTableRows(awards: Record<string, ProcessedAward> | null | undefined): string {
        // Handle null, undefined, or empty awards object
        if (!awards || Object.keys(awards).length === 0) {
            return `<tr><td colspan="4" class="no-data">No awards found</td></tr>`;
        }
    
        console.log('Awards:', awards);
    
        const rows = Object.entries(awards)
            .map(([awardId, award]) => {
                return `
                    <tr>
                        <td class="award-id">${awardId}</td>
                    </tr>
                `;
            })
            .join('');
    
        // Return rows if they exist, otherwise return a "no valid awards" message
        return rows || `<tr><td colspan="4" class="no-data">No valid awards found</td></tr>`;
    }
    

    public render(awards: Record<string, ProcessedAward>): string {
        try {
            return this.template
                .replace('{{styles}}', this.styles)
                .replace('{{tableRows}}', this.generateTableRows(awards));
        } catch (error) {
            console.error('Error rendering template:', error);
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error</title>
                    <style>${this.styles}</style>
                </head>
                <body>
                    <h1>Federal Contract Fraud Detection System</h1>
                    <div class="no-data">Error loading awards data</div>
                </body>
                </html>
            `;
        }
    }
} 