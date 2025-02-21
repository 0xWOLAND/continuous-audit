import express, { Request, Response } from 'express';
import cron from 'node-cron';
import { USAspendingAPI } from './services/USASpendingAPI.js';

const app = express();
const port = process.env.PORT || 3000;

// Initialize API client
const api = new USAspendingAPI();
await api.initDB();

// Schedule polling every 6 hours
cron.schedule('0 */6 * * *', async () => {
    console.log('Running scheduled awards polling...');
    try {
        await api.processAwards();
        console.log('Finished polling awards');
    } catch (error) {
        console.error('Error during scheduled polling:', error);
    }
});

// API endpoints
app.get('/awards', async (_req: Request, res: Response) => {
    try {
        if (!api.db) {
            throw new Error('Database not initialized');
        }
        const awards = api.db.data;
        res.json(awards);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch awards' });
    }
});

app.get('/awards/:awardId', async (req: Request, res: Response) => {
    try {
        if (!api.db) {
            throw new Error('Database not initialized');
        }
        const award = api.db.data[req.params.awardId];
        if (!award) {
            return res.status(404).json({ error: 'Award not found' });
        }
        res.json(award);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch award' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // Initial poll on server start
    api.processAwards()
        .then(() => console.log('Initial awards polling completed'))
        .catch(error => console.error('Error during initial polling:', error));
}); 