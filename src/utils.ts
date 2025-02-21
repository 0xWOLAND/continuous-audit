export const withBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
        try { return await fn(); }
        catch (e: any) {
            if (i === maxRetries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * 2 ** i * (e?.statusCode === 429 ? 5 : 1)));
        }
    }
    throw new Error('Unreachable');
};

export const sleep = async (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));