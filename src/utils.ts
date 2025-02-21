export async function withBackoff<T>(
    fn: () => Promise<T>, 
    maxRetries = 10,  // Increase retries
    baseDelay = 1000,
    maxDelay = 32000 // Cap maximum delay at 32 seconds
): Promise<T> {
    let retries = 0;
    
    while (retries <= maxRetries) {
        try {
            return await fn();
        } catch (error) {
            if (retries === maxRetries) {
                console.error('Max retries reached, throwing error');
                throw error;
            }

            const delay = Math.min(baseDelay * Math.pow(2, retries), maxDelay);
            await sleep(delay);
            retries++;
        }
    }

    throw new Error('Unreachable');
}

export const sleep = async (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));