export async function withBackoff<T>(
    fn: () => Promise<T>, 
    maxRetries = 3,
    baseDelay = 1000
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

            const delay = baseDelay * Math.pow(2, retries);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        }
    }

    throw new Error('Unreachable');
}

export const sleep = async (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));