// API endpoint configuration
const API_BASE_URL = 'http://localhost:8787';

// DOM Elements
let statusDiv, loadingDiv, awardsTableBody;

document.addEventListener('DOMContentLoaded', () => {
    statusDiv = document.getElementById('status');
    loadingDiv = document.getElementById('loading');
    awardsTableBody = document.getElementById('awardsTableBody');
    fetchAwards();
});

// Create modal elements
const modal = document.createElement('div');
modal.id = 'researchModal';
modal.className = 'modal';
modal.innerHTML = `
    <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Research Results</h2>
        <div id="modalContent"></div>
    </div>
`;
document.body.appendChild(modal);

const modalContent = document.getElementById('modalContent');
const closeBtn = modal.querySelector('.close');

// Close modal when clicking the X
closeBtn.onclick = () => hideModal();

// Close modal when clicking outside
window.onclick = (event) => {
    if (event.target === modal) {
        hideModal();
    }
}

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
    console.log("fetching awards")
    try {
        loadingDiv.style.display = 'block';
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
        
        // Fetch research status for all awards in parallel
        const researchStatuses = await Promise.all(
            Object.keys(awards).map(async (awardId) => {
                try {
                    const response = await fetch(`${API_BASE_URL}/awards/${awardId}/research`);
                    if (response.ok) {
                        const research = await response.json();
                        return {
                            awardId,
                            status: 'Complete',
                            research: research
                        };
                    }
                    return {
                        awardId,
                        status: 'Not Started',
                        research: null
                    };
                } catch (error) {
                    console.error(`Error fetching research for award ${awardId}:`, error);
                    return {
                        awardId,
                        status: 'Not Started',
                        research: null
                    };
                }
            })
        );

        // Create a map of research statuses
        const researchStatusMap = researchStatuses.reduce((map, status) => {
            map[status.awardId] = status;
            return map;
        }, {});

        displayAwards(awards, researchStatusMap);
        showStatus('Awards loaded successfully!');
    } catch (error) {
        console.error('Error:', error);
        showStatus(error.message, true);
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Function to display awards in the table
function displayAwards(awards, researchStatusMap) {
    awardsTableBody.innerHTML = '';
    if (!awards || Object.keys(awards).length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="11" class="no-data">No awards found</td>';
        awardsTableBody.appendChild(row);
        return;
    }

    Object.entries(awards).forEach(([awardId, award]) => {
        const row = document.createElement('tr');
        
        // Get research status from the map
        const researchStatus = researchStatusMap[awardId] || { status: 'Not Started', research: null };
        const research = researchStatus.research;
        
        let showButton = '';
        let riskLevel = 'N/A';
        let riskClass = '';
        
        if (research) {
            showButton = `<button class="show-btn" data-award-id="${awardId}">Show</button>`;
            
            // Get risk level from the primary finding
            if (research.findings && research.findings[0]) {
                riskLevel = research.findings[0].analysis.reasoning.riskLevel;
                riskClass = `risk-${riskLevel}`;
            }
        }

        row.innerHTML = `
            <td>${awardId}</td>
            <td>${award.basicInfo?.recipientName || 'N/A'}</td>
            <td>${formatCurrency(award.basicInfo?.awardAmount) || 'N/A'}</td>
            <td>${award.details?.description || 'N/A'}</td>
            <td>${award.details?.type_description || 'N/A'}</td>
            <td>${award.details?.awarding_agency?.toptier_agency?.name || 'N/A'}</td>
            <td>
                ${riskLevel !== 'N/A' ? 
                    `<div class="risk-badge risk-${String(riskLevel).toLowerCase()}">
                        <span class="risk-dot"></span>
                        Risk Level ${riskLevel}
                    </div>` : 
                    'N/A'
                }
            </td>
            <td class="research-status ${researchStatus.status === 'Complete' ? 'status-complete' : ''}">${researchStatus.status}</td>
            <td>
                ${showButton}
                <button class="research-btn" data-award-id="${awardId}">Research</button>
            </td>
        `;
        awardsTableBody.appendChild(row);

        // Add click handler for the show button if it exists
        const showBtn = row.querySelector('.show-btn');
        if (showBtn) {
            showBtn.addEventListener('click', () => showResearch(awardId));
        }

        // Add click handler for the research button
        const researchBtn = row.querySelector('.research-btn');
        researchBtn.addEventListener('click', () => startResearch(awardId));
    });
}

// Function to display research in modal
function displayResearchInModal(awardId, research) {
    // Get the primary finding for the header
    const primaryFinding = research.findings[0];
    const primaryAnalysis = primaryFinding.analysis.reasoning;
    
    modalContent.innerHTML = `
        <div class="research-results">
            <div class="research-header">
                <div class="award-info">
                    <h3>Research Results</h3>
                    <div class="award-id">Award ID: ${research.originalAwardId}</div>
                </div>
                <div class="risk-indicator">
                    <div class="risk-label">Overall Risk Level</div>
                    <div class="risk-meter risk-${primaryAnalysis.riskLevel}">
                        ${primaryAnalysis.riskLevel}
                        <span class="risk-max">/5</span>
                    </div>
                </div>
            </div>

            <div class="research-main">
                <div class="research-section">
                    <h4><i class="fas fa-lightbulb"></i> Primary Assessment</h4>
                    <div class="initial-thoughts">
                        ${primaryAnalysis.initialThoughts}
                    </div>
                </div>

                <div class="research-grid">
                    <div class="research-section">
                        <h4><i class="fas fa-exclamation-triangle"></i> Key Risk Indicators</h4>
                        <ul class="risk-indicators">
                            ${primaryAnalysis.indicators.map(indicator => 
                                `<li>${indicator}</li>`
                            ).join('')}
                        </ul>
                    </div>

                    <div class="research-section">
                        <h4><i class="fas fa-search"></i> Areas for Investigation</h4>
                        <ul class="investigation-areas">
                            ${primaryAnalysis.questions.map(question => 
                                `<li>${question}</li>`
                            ).join('')}
                        </ul>
                    </div>
                </div>

                <div class="research-section">
                    <h4><i class="fas fa-balance-scale"></i> Risk Assessment</h4>
                    <div class="risk-justification">
                        ${primaryAnalysis.justification}
                    </div>
                </div>

                <div class="detailed-findings-section">
                    <div class="findings-header">
                        <h4><i class="fas fa-file-alt"></i> Source Documents and Analysis</h4>
                        <span class="findings-count">${research.findings.length} source${research.findings.length !== 1 ? 's' : ''} analyzed</span>
                    </div>
                    <div class="findings-container">
                        ${research.findings.map((finding, index) => {
                            const analysis = finding.analysis.reasoning;
                            return `
                                <div class="finding-card">
                                    <div class="finding-header">
                                        <div class="finding-title">
                                            <span class="finding-number">Source ${index + 1}</span>
                                            <span class="finding-risk risk-${analysis.riskLevel}">
                                                Risk Level ${analysis.riskLevel}/5
                                            </span>
                                        </div>
                                    </div>
                                    <div class="finding-content">
                                        <div class="finding-source-content">
                                            <h5><i class="fas fa-file-alt"></i> Source Content</h5>
                                            <div class="source-text">
                                                ${finding.content}
                                            </div>
                                        </div>
                                        
                                        <div class="finding-analysis">
                                            <h5><i class="fas fa-microscope"></i> Analysis</h5>
                                            <div class="analysis-section">
                                                <h6>Initial Assessment</h6>
                                                <p>${analysis.initialThoughts}</p>
                                            </div>
                                            
                                            <div class="analysis-section">
                                                <h6>Risk Indicators</h6>
                                                <ul>
                                                    ${analysis.indicators.map(indicator => 
                                                        `<li>${indicator}</li>`
                                                    ).join('')}
                                                </ul>
                                            </div>
                                            
                                            <div class="analysis-section">
                                                <h6>Areas for Further Investigation</h6>
                                                <ul>
                                                    ${analysis.questions.map(question => 
                                                        `<li>${question}</li>`
                                                    ).join('')}
                                                </ul>
                                            </div>
                                            
                                            <div class="analysis-section">
                                                <h6>Risk Assessment</h6>
                                                <p>${analysis.justification}</p>
                                            </div>
                                        </div>

                                        <div class="finding-footer">
                                            <div class="source-info">
                                                <a href="${finding.source}" target="_blank" rel="noopener noreferrer">
                                                    <i class="fas fa-external-link-alt"></i> View Original Document
                                                </a>
                                                <span class="finding-date">
                                                    Analyzed on ${new Date(finding.analysis.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <div class="relevance-score">
                                                Relevance Score: ${(finding.relevanceScore * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div class="research-footer">
                <div class="timestamp">
                    Last updated: ${new Date(primaryFinding.analysis.timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    `;
    showModal();

    // Add click handlers for finding cards to expand/collapse
    const findingCards = modalContent.querySelectorAll('.finding-card');
    findingCards.forEach(card => {
        // Make the header clickable to expand/collapse
        const header = card.querySelector('.finding-header');
        const content = card.querySelector('.finding-content');
        
        // Show content by default
        content.style.display = 'block';
        
        header.addEventListener('click', () => {
            const isExpanded = content.style.display !== 'none';
            content.style.display = isExpanded ? 'none' : 'block';
            header.classList.toggle('collapsed', !isExpanded);
        });
    });
}

// Function to handle research button click
async function startResearch(awardId) {
    const researchBtn = document.querySelector(`button.research-btn[data-award-id="${awardId}"]`);
    const statusCell = researchBtn.parentElement.previousElementSibling;
    try {
        researchBtn.disabled = true;
        researchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Researching...';
        statusCell.innerHTML = '<i class="fas fa-spinner fa-spin"></i> In Progress';
        statusCell.className = 'research-status status-in-progress';

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
        
        // Update the row to show the new status and add show button
        statusCell.textContent = 'Complete';
        statusCell.className = 'research-status status-complete';
        
        // Add show button if it doesn't exist
        if (!researchBtn.parentElement.querySelector('.show-btn')) {
            const showBtn = document.createElement('button');
            showBtn.className = 'show-btn';
            showBtn.setAttribute('data-award-id', awardId);
            showBtn.innerHTML = '<i class="fas fa-eye"></i> Show';
            showBtn.addEventListener('click', () => showResearch(awardId));
            researchBtn.parentElement.insertBefore(showBtn, researchBtn);
        }
    } catch (error) {
        console.error('Error:', error);
        showStatus('Failed to start research: ' + error.message, true);
        statusCell.textContent = 'Failed';
        statusCell.className = 'research-status status-failed';
    } finally {
        researchBtn.disabled = false;
        researchBtn.innerHTML = '<i class="fas fa-search"></i> Research';
    }
}

// Function to show existing research
async function showResearch(awardId) {
    try {
        modalContent.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading research data...</p>
            </div>
        `;
        showModal();

        const response = await fetch(`${API_BASE_URL}/awards/${awardId}/research`);
        if (!response.ok) {
            throw new Error(`Failed to load research: ${response.status}`);
        }

        const research = await response.json();
        displayResearchInModal(awardId, research);
    } catch (error) {
        console.error('Error:', error);
        modalContent.innerHTML = `
            <div class="error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load research data</p>
                <p class="error-details">${error.message}</p>
            </div>
        `;
    }
}

function showModal() {
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
}

// In your modal close functions
function hideModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}