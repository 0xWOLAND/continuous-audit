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
        row.innerHTML = '<td colspan="9" class="no-data">No awards found</td>';
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
            <td><button class="research-btn" data-award-id="${awardId}">Research</button></td>
        `;
        awardsTableBody.appendChild(row);

        // Add click handler for the research button
        const researchBtn = row.querySelector('.research-btn');
        researchBtn.addEventListener('click', () => startResearch(awardId));
    });
}

// Function to handle research button click
async function startResearch(awardId) {
    try {
        const researchBtn = document.querySelector(`[data-award-id="${awardId}"]`);
        researchBtn.disabled = true;
        researchBtn.textContent = 'Researching...';

        const response = await fetch(`${API_BASE_URL}/awards/${awardId}/research`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to start research: ${response.status}`);
        }

        const result = await response.json();
        showStatus(`Research started for award ${awardId}`);
    } catch (error) {
        console.error('Error starting research:', error);
        showStatus('Failed to start research: ' + error.message, true);
    } finally {
        const researchBtn = document.querySelector(`[data-award-id="${awardId}"]`);
        researchBtn.disabled = false;
        researchBtn.textContent = 'Research';
    }
}

// Event Listeners
fetchButton.addEventListener('click', fetchAwards);