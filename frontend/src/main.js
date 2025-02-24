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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Helper function to format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Function to trigger manual fetch of awards
async function fetchAwards() {
    try {
        loadingDiv.style.display = 'block';
        fetchButton.disabled = true;

        const testResponse = await fetch(`${API_BASE_URL}/test`);
        console.log('Test response:', testResponse);
        if (!testResponse.ok) {
            throw new Error(`Backend server at ${API_BASE_URL} is not available. Please make sure it's running.`);
        }

        // First trigger manual fetch
        const fetchResponse = await fetch(`${API_BASE_URL}/fetch-awards`, {
            method: 'POST'
        });

        if (!fetchResponse.ok) {
            throw new Error(`Failed to trigger award fetch: ${fetchResponse.status}`);
        }

        showStatus('Successfully triggered awards fetch. Now loading awards...');

        // Then get the awards
        const awardsResponse = await fetch(`${API_BASE_URL}/awards`);
        if (!awardsResponse.ok) {
            throw new Error(`Failed to fetch awards: ${awardsResponse.status}`);
        }

        const awards = await awardsResponse.json();
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
    
    Object.entries(awards).forEach(([awardId, award]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${awardId}</td>
            <td>${award.description || 'N/A'}</td>
            <td>${formatCurrency(award.amount || 0)}</td>
            <td>${award.recipient_name || 'N/A'}</td>
            <td>${award.action_date ? formatDate(award.action_date) : 'N/A'}</td>
        `;
        awardsTableBody.appendChild(row);
    });
}

// Event Listeners
fetchButton.addEventListener('click', fetchAwards); 