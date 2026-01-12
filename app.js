/**
 * Ask Dot - Frontend Application
 * Handles PIN authentication, conversation flow, and UI interactions
 */

// ===== CONFIGURATION =====
const API_BASE = ''; // Empty for same-origin, or set to your Railway URL

// PIN Database - just Michael for now
// Later: move to Airtable via app.py
const PINS = {
    '9871': { name: 'Michael', fullName: 'Michael Goldthorpe', client: 'ALL', clientName: 'Hunch', mode: 'hunch' }
};

// Sample data - will be replaced with Airtable API calls
const ALL_CLIENTS = [
    { code: 'SKY', name: 'Sky', jobCount: 8 },
    { code: 'ONE', name: 'One NZ', jobCount: 12 },
    { code: 'TOW', name: 'Tower', jobCount: 4 },
    { code: 'FIS', name: 'Fisher Funds', jobCount: 3 }
];

const SAMPLE_JOBS = {
    'SKY': [
        { number: 'SKY 014', name: 'Brand Refresh', stage: 'Craft', due: 'Wed 15', status: 'In Progress', update: 'Layouts approved, moving to production.', owner: 'Aimee Mitchell', lastUpdated: '2 days ago' },
        { number: 'SKY 016', name: 'Q1 Campaign', stage: 'Clarify', due: 'Mon 20', status: 'In Progress', update: 'Awaiting brief clarification on target audience.', owner: 'Maja Lee', lastUpdated: '1 day ago' },
        { number: 'SKY 017', name: 'Social Templates', stage: 'Deliver', due: 'Today', status: 'With Client', update: 'Final files sent for approval.', owner: 'Mikaila Watts', lastUpdated: 'Today' }
    ],
    'ONE': [
        { number: 'ONE 083', name: 'Simplification Phase 2', stage: 'Craft', due: 'Fri 17', status: 'In Progress', update: 'Working through form redesigns.', owner: 'Anita Campbell', lastUpdated: '3 days ago' },
        { number: 'ONE 085', name: 'Business Comms', stage: 'Refine', due: 'Thu 16', status: 'In Progress', update: 'Round 2 amends in progress.', owner: 'Naomi Reynolds', lastUpdated: '1 day ago' },
        { number: 'ONE 090', name: 'App Launch', stage: 'Clarify', due: 'Mon 27', status: 'Incoming', update: 'Brief received, scheduling kick-off.', owner: 'Jess Downey', lastUpdated: 'Today' }
    ],
    'TOW': [
        { number: 'TOW 083', name: 'Claims Process', stage: 'Refine', due: 'Wed 15', status: 'In Progress', update: 'Client reviewing round 1.', owner: 'Paige Buckland', lastUpdated: '4 days ago' },
        { number: 'TOW 087', name: 'Policy Docs', stage: 'Craft', due: 'Fri 24', status: 'In Progress', update: 'First drafts underway.', owner: 'Paige Buckland', lastUpdated: '2 days ago' }
    ],
    'FIS': [
        { number: 'FIS 007', name: 'Annual Report', stage: 'Deliver', due: 'Mon 13', status: 'With Client', update: 'Final proof sent.', owner: 'Jade Jordan', lastUpdated: 'Today' },
        { number: 'FIS 023', name: 'Fund Factsheets', stage: 'Craft', due: 'Fri 17', status: 'In Progress', update: 'Updating Q4 data.', owner: 'Jade Jordan', lastUpdated: '1 day ago' }
    ]
};

// ===== STATE =====
let enteredPin = '';
let currentUser = null;

// ===== DOM ELEMENTS =====
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

const pinScreen = $('pin-screen');
const pinError = $('pin-error');
const homeContent = $('home-content');
const conversationView = $('conversation-view');
const conversationArea = $('conversation-area');
const homeInput = $('home-input');
const chatInput = $('chat-input');
const userName = $('user-name');
const dropdown = $('dropdown');
const overlay = $('overlay');
const hamburger = $('hamburger');
const examples = $('examples');

// ===== PIN FUNCTIONS =====
function enterPin(digit) {
    if (enteredPin.length >= 4) return;
    enteredPin += digit;
    updatePinDots();
    pinError.classList.remove('visible');
    if (enteredPin.length === 4) {
        setTimeout(checkPin, 150);
    }
}

function deletePin() {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
    pinError.classList.remove('visible');
}

function updatePinDots() {
    for (let i = 0; i < 4; i++) {
        const dot = $('dot-' + i);
        dot.classList.remove('filled', 'error');
        if (i < enteredPin.length) {
            dot.classList.add('filled');
        }
    }
}

function checkPin() {
    const user = PINS[enteredPin];
    if (user) {
        currentUser = { ...user, pin: enteredPin };
        sessionStorage.setItem('dotUser', JSON.stringify(currentUser));
        unlockApp();
    } else {
        $$('.pin-dot').forEach(d => d.classList.add('error'));
        pinError.classList.add('visible');
        setTimeout(() => {
            enteredPin = '';
            updatePinDots();
        }, 500);
    }
}

function unlockApp() {
    pinScreen.classList.add('hidden');
    userName.textContent = currentUser.name.toUpperCase();
    updateExamplesForUser();
}

function updateExamplesForUser() {
    if (currentUser.mode === 'client') {
        examples.innerHTML = `
            <button class="example-btn" data-question="Show me my jobs">Show me my jobs</button>
            <button class="example-btn" data-question="What's overdue?">What's overdue?</button>
            <button class="example-btn" data-question="What can Dot do?">What can Dot do?</button>
        `;
        bindExampleButtons();
    }
}

function signOut() {
    closeMenu();
    sessionStorage.removeItem('dotUser');
    currentUser = null;
    enteredPin = '';
    updatePinDots();
    pinScreen.classList.remove('hidden');
    goHome();
}

function checkSession() {
    const stored = sessionStorage.getItem('dotUser');
    if (stored) {
        currentUser = JSON.parse(stored);
        unlockApp();
    }
}

// ===== MENU FUNCTIONS =====
function toggleMenu() {
    hamburger.classList.toggle('open');
    dropdown.classList.toggle('open');
    overlay.classList.toggle('open');
}

function closeMenu() {
    hamburger.classList.remove('open');
    dropdown.classList.remove('open');
    overlay.classList.remove('open');
}

function menuAction(action) {
    closeMenu();
    switch(action) {
        case 'wip':
            window.open('https://dot.hunch.co.nz/todo.html', '_blank');
            break;
        case 'tracker':
            askQuestion('Show me the tracker');
            break;
        case 'update':
            askQuestion('I want to make an update');
            break;
        case 'about':
            askQuestion('What can Dot do?');
            break;
        case 'signout':
            signOut();
            break;
    }
}

// ===== CONVERSATION FUNCTIONS =====
function goHome() {
    homeContent.classList.remove('hidden');
    conversationView.classList.remove('visible');
    homeInput.value = '';
    conversationArea.innerHTML = '';
}

function askQuestion(text) {
    homeInput.value = text;
    startConversation();
}

function startConversation() {
    const question = homeInput.value.trim() || 'Show me WIP';
    homeContent.classList.add('hidden');
    conversationView.classList.add('visible');
    addUserMessage(question);
    setTimeout(() => processQuestion(question), 100);
}

function continueConversation() {
    const question = chatInput.value.trim();
    if (!question) return;
    addUserMessage(question);
    chatInput.value = '';
    setTimeout(() => processQuestion(question), 100);
}

function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'user-message fade-in';
    msg.textContent = text;
    conversationArea.appendChild(msg);
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

function addThinkingDots() {
    const dots = document.createElement('div');
    dots.className = 'thinking-dots';
    dots.id = 'currentThinking';
    dots.innerHTML = `
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
    `;
    conversationArea.appendChild(dots);
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

function removeThinkingDots() {
    const dots = $('currentThinking');
    if (dots) dots.remove();
}

function processQuestion(question) {
    const q = question.toLowerCase();
    addThinkingDots();
    
    setTimeout(() => {
        removeThinkingDots();
        
        if (currentUser && currentUser.mode === 'client') {
            // Client mode - restricted view
            if (q.includes('wip') || q.includes('jobs') || q.includes('my jobs')) {
                showJobsForClient(currentUser.client === 'ONS' ? 'ONE' : currentUser.client);
            } else if (q.includes('overdue')) {
                showOverdueJobs(currentUser.client === 'ONS' ? 'ONE' : currentUser.client);
            } else if (q.includes('what can dot do') || q.includes('about dot') || q.includes('help')) {
                showAboutDot();
            } else {
                showDefaultResponse(question);
            }
        } else {
            // Hunch mode - full access
            if (q.includes('wip') && !q.includes('sky') && !q.includes('one') && !q.includes('tower') && !q.includes('fisher')) {
                showClientPicker();
            } else if (q.includes('wip') && q.includes('sky')) {
                showJobsForClient('SKY');
            } else if (q.includes('wip') && (q.includes('one') || q.includes('one nz'))) {
                showJobsForClient('ONE');
            } else if (q.includes('wip') && q.includes('tower')) {
                showJobsForClient('TOW');
            } else if (q.includes('wip') && q.includes('fisher')) {
                showJobsForClient('FIS');
            } else if (q.includes('overdue')) {
                showClientPicker('overdue');
            } else if (q.includes('what can dot do') || q.includes('about dot') || q.includes('help')) {
                showAboutDot();
            } else if (q.includes('tracker')) {
                showTrackerComingSoon();
            } else {
                showDefaultResponse(question);
            }
        }
        
        conversationArea.scrollTop = conversationArea.scrollHeight;
    }, 1000);
}

// ===== RESPONSE GENERATORS =====
function showClientPicker(filter = '') {
    const clients = currentUser.mode === 'hunch' ? ALL_CLIENTS : 
        ALL_CLIENTS.filter(c => c.code === currentUser.client);
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Which client?</p>
        <div class="client-cards">
            ${clients.map(c => `
                <div class="client-card" data-client="${c.code}" data-filter="${filter}">
                    <div>
                        <div class="client-name">${c.name}</div>
                        <div class="client-count">${c.jobCount} active jobs</div>
                    </div>
                    <span class="card-chevron">›</span>
                </div>
            `).join('')}
        </div>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Show all jobs">Show all</button>
            <button class="smart-prompt" data-question="Just overdue">Just overdue</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function selectClient(code, filter) {
    const client = ALL_CLIENTS.find(c => c.code === code);
    addUserMessage(client.name);
    addThinkingDots();
    
    setTimeout(() => {
        removeThinkingDots();
        if (filter === 'overdue') {
            showOverdueJobs(code);
        } else {
            showJobsForClient(code);
        }
        conversationArea.scrollTop = conversationArea.scrollHeight;
    }, 800);
}

function showJobsForClient(code) {
    const clientJobs = SAMPLE_JOBS[code] || [];
    const client = ALL_CLIENTS.find(c => c.code === code);
    
    if (clientJobs.length === 0) {
        showEmptyState(client?.name || code);
        return;
    }
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Here's what's on for ${client?.name || code}:</p>
        <div class="job-cards">
            ${clientJobs.map((job, i) => createJobCard(job, i)).join('')}
        </div>
        <div class="smart-prompts">
            ${currentUser.mode === 'hunch' ? '<button class="smart-prompt" data-question="WIP for another client">Another client</button>' : ''}
            <button class="smart-prompt" data-question="What's with client?">What's with client?</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showOverdueJobs(code) {
    const clientJobs = (SAMPLE_JOBS[code] || []).filter(j => j.due === 'Today' || j.status === 'With Client');
    const client = ALL_CLIENTS.find(c => c.code === code);
    
    if (clientJobs.length === 0) {
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">Nothing overdue for ${client?.name || code}! 🎉</p>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Show all jobs">Show all jobs</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
        return;
    }
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Here's what needs attention for ${client?.name || code}:</p>
        <div class="job-cards">
            ${clientJobs.map((job, i) => createJobCard(job, i)).join('')}
        </div>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Show all jobs">Show all jobs</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function createJobCard(job, index) {
    const id = `job-${Date.now()}-${index}`;
    return `
        <div class="job-card" id="${id}">
            <div class="job-card-header" data-job-id="${id}">
                <div class="job-info">
                    <div class="job-title">${job.number} — ${job.name}</div>
                    <div class="job-meta">
                        ${job.stage}
                        <span class="job-meta-dot"></span>
                        Due ${job.due}
                        <span class="job-meta-dot"></span>
                        ${job.status}
                    </div>
                </div>
                <span class="card-chevron">›</span>
            </div>
            <div class="job-details">
                <div class="job-update-text">"${job.update}"</div>
                <div class="job-detail-row">
                    <span class="job-detail-label">Owner</span>
                    <span class="job-detail-value">${job.owner}</span>
                </div>
                <div class="job-detail-row">
                    <span class="job-detail-label">Updated</span>
                    <span class="job-detail-value">${job.lastUpdated}</span>
                </div>
                ${currentUser.mode === 'hunch' ? `<button class="update-btn" data-job="${job.number}">UPDATE</button>` : ''}
            </div>
        </div>
    `;
}

function toggleJobCard(id) {
    $(id).classList.toggle('expanded');
}

function makeUpdate(jobNumber) {
    alert(`Opening update for ${jobNumber}...`);
    // TODO: Implement update flow
}

function showEmptyState(clientName) {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p class="empty-text">No active jobs found for ${clientName}.</p>
        </div>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Show all clients">Try another client</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showAboutDot() {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">I'm Dot, your project assistant! I can help you:</p>
        <p class="dot-text" style="margin-bottom: 8px;">
            • Check on jobs and client work<br>
            • See what's overdue or needs attention<br>
            • Navigate to WIP or Tracker<br>
            ${currentUser.mode === 'hunch' ? '• Make quick updates' : ''}
        </p>
        <p class="dot-text">Just ask me anything about your projects!</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="${currentUser.mode === 'client' ? 'Show me my jobs' : 'Show me WIP'}">Try it</button>
            <button class="smart-prompt" data-question="What's overdue?">What's overdue?</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showTrackerComingSoon() {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">The Tracker is coming soon! 🚀</p>
        <p class="dot-text">For now, I can help you with WIP and project updates.</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Show me WIP">Show me WIP</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showDefaultResponse(question) {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">I'm not sure how to help with that yet. Try asking about:</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="${currentUser.mode === 'client' ? 'Show me my jobs' : 'Show me WIP'}">${currentUser.mode === 'client' ? 'My jobs' : 'Show me WIP'}</button>
            <button class="smart-prompt" data-question="What's overdue?">What's overdue?</button>
            <button class="smart-prompt" data-question="What can Dot do?">What can Dot do?</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function askFromChat(text) {
    chatInput.value = text;
    continueConversation();
}

// ===== EVENT BINDING =====
function bindDynamicElements(container) {
    // Bind smart prompts
    container.querySelectorAll('.smart-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            askFromChat(btn.dataset.question);
        });
    });
    
    // Bind client cards
    container.querySelectorAll('.client-card').forEach(card => {
        card.addEventListener('click', () => {
            selectClient(card.dataset.client, card.dataset.filter);
        });
    });
    
    // Bind job card headers
    container.querySelectorAll('.job-card-header').forEach(header => {
        header.addEventListener('click', () => {
            toggleJobCard(header.dataset.jobId);
        });
    });
    
    // Bind update buttons
    container.querySelectorAll('.update-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            makeUpdate(btn.dataset.job);
        });
    });
}

function bindExampleButtons() {
    $$('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            askQuestion(btn.dataset.question);
        });
    });
}

// ===== INITIALIZATION =====
function init() {
    // Check for existing session
    checkSession();
    
    // PIN keypad
    $$('.pin-key[data-digit]').forEach(key => {
        key.addEventListener('click', () => {
            enterPin(parseInt(key.dataset.digit));
        });
    });
    
    $('pin-delete').addEventListener('click', deletePin);
    
    // Menu
    hamburger.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);
    
    $$('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            menuAction(item.dataset.action);
        });
    });
    
    // Home button
    $('home-btn').addEventListener('click', goHome);
    
    // Home input
    homeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startConversation();
    });
    
    $('home-send').addEventListener('click', startConversation);
    
    // Chat input
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') continueConversation();
    });
    
    // Example buttons
    bindExampleButtons();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
