import { USAspendingAPI } from '../src/services/USASpendingAPI';

// Mock KV namespace for testing
const mockKV: KVNamespace = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
  list: async () => ({ keys: [] }),
} as unknown as KVNamespace;

async function testFetch() {
  const workerUrl = 'http://localhost:8787';
  console.log('Starting test fetch from worker...');
  
  try {
    // // First trigger a manual fetch of awards
    // console.log('\nTriggering manual fetch of awards...');
    // const fetchResponse = await fetch(`${workerUrl}/fetch-awards`, {
    //   method: 'POST'
    // });

    // if (!fetchResponse.ok) {
    //   throw new Error(`Failed to trigger award fetch: ${fetchResponse.status}`);
    // }
    // const fetchResult = await fetchResponse.json();
    // console.log('Fetch result:', fetchResult);

    // Test /awards endpoint
    console.log('\nFetching awards from worker...');
    const awardsResponse = await fetch(`${workerUrl}/awards`);
    if (!awardsResponse.ok) {
      throw new Error(`HTTP error! status: ${awardsResponse.status}`);
    }
    const awards: Record<string, unknown> = await awardsResponse.json();
    console.log('\nAwards response:', JSON.stringify(awards, null, 2));

    // Get first award ID if available
    const awardIds = Object.keys(awards);
    if (awardIds.length > 0) {
      const firstAwardId = awardIds[0];
      console.log(`\nFetching single award ${firstAwardId} from worker...`);
      
      const awardResponse = await fetch(`${workerUrl}/awards/${firstAwardId}`);
      if (!awardResponse.ok) {
        throw new Error(`HTTP error! status: ${awardResponse.status}`);
      }
      const award = await awardResponse.json();
      console.log('\nSingle award response:', JSON.stringify(award, null, 2));
    } else {
      console.log('\nNo awards found to test single award endpoint');
    }

    // Test non-existent award
    console.log('\nTesting 404 response...');
    const notFoundResponse = await fetch(`${workerUrl}/awards/nonexistent`);
    console.log('404 test status:', notFoundResponse.status);

  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
console.log('Note: Make sure your worker is running with `pnpm dev` before running this test');
testFetch()
  .then(() => console.log('\nTest completed'))
  .catch(console.error); 