// API endpoint configuration
const API_BASE_URL = 'http://localhost:8787';

// DOM Elements
const fetchButton = document.getElementById('fetchButton');
const statusDiv = document.getElementById('status');
const loadingDiv = document.getElementById('loading');
const awardsTableBody = document.getElementById('awardsTableBody');

// Helper function to show status messages
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.className = isError ? 'error' : 'success';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// Helper function to format currency
function formatCurrency(amount) {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Function to fetch awards
async function fetchAwards() {
    try {
        loadingDiv.style.display = 'block';
        fetchButton.disabled = true;

        const testResponse = await fetch(`${API_BASE_URL}/test`);
        console.log('Test response:', testResponse);
        if (!testResponse.ok) {
            throw new Error(`Backend server at ${API_BASE_URL} is not available. Please make sure it's running.`);
        }

        // Get the awards
        const awardsResponse = await fetch(`${API_BASE_URL}/awards`);
        console.log('Awards response:', awardsResponse);
        if (!awardsResponse.ok) {
            // If no awards found, trigger a manual fetch
            if (awardsResponse.status === 404) {
                const fetchResponse = await fetch(`${API_BASE_URL}/fetch-awards`, {
                    method: 'POST'
                });

                if (!fetchResponse.ok) {
                    throw new Error(`Failed to trigger award fetch: ${fetchResponse.status}`);
                }

                showStatus('No awards found. Triggered manual fetch. Please try again in a moment.');
                return;
            }
            throw new Error(`Failed to fetch awards: ${awardsResponse.status}`);
        }

        const awards = await awardsResponse.json();
        console.log('Awards:', awards);
        displayAwards(awards);
        showStatus('Awards loaded successfully!');
    } catch (error) {
        console.error('Error:', error);
        showStatus(error.message, true);
    } finally {
        loadingDiv.style.display = 'none';
        fetchButton.disabled = false;
    }
}

// Function to display awards in the table
function displayAwards(awards) {
    awardsTableBody.innerHTML = '';
    if (!awards || Object.keys(awards).length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="no-data">No awards found</td>';
        awardsTableBody.appendChild(row);
        return;
    }

    Object.entries(awards).forEach(([awardId, award]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${awardId}</td>
            <td>${award.basicInfo?.recipientName || 'N/A'}</td>
            <td>${formatCurrency(award.basicInfo?.awardAmount) || 'N/A'}</td>
            <td>${formatDate(award.basicInfo?.awardDate) || 'N/A'}</td>
            <td>${award.details?.description || 'N/A'}</td>
            <td>${award.details?.category || 'N/A'}</td>
            <td>${award.details?.type_description || 'N/A'}</td>
            <td>${award.details?.awarding_agency?.toptier_agency?.name || 'N/A'}</td>
        `;
        awardsTableBody.appendChild(row);
    });
}

// Event Listeners
fetchButton.addEventListener('click', fetchAwards);