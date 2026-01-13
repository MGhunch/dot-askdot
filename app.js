/**
 * Ask Dot - v2
 * Clean logic model: Parse → Apply Defaults → Execute → Render
 */

// ===== CONFIGURATION =====
const API_BASE = 'https://dot-remote-api.up.railway.app';
const PROXY_BASE = 'https://dot-proxy.up.railway.app';

// Key clients shown in picker (rest go to "Other")
const KEY_CLIENTS = ['ONE', 'ONB', 'ONS', 'SKY', 'TOW'];

// Display name overrides for clients
const CLIENT_DISPLAY_NAMES = {
    'ONE': 'One NZ (Marketing)',
    'ONB': 'One NZ (Business)',
    'ONS': 'One NZ (Simplification)'
};

// Helper to get display name
function getClientDisplayName(client) {
    return CLIENT_DISPLAY_NAMES[client.code] || client.name;
}

// PIN Database
const PINS = {
    '9871': { name: 'Michael', fullName: 'Michael Goldthorpe', client: 'ALL', clientName: 'Hunch', mode: 'hunch' }
};

// ===== KEYWORDS =====
const KEYWORDS = {
    DUE: ['due', 'overdue', 'deadline', "what's next", 'next', 'urgent'],
    FIND: ["what's on", 'show', 'check', 'find', 'jobs'],
    UPDATE: ['update'],
    TRACKER: ['tracker', 'spend', 'budget'],
    HELP: ['help', 'what can dot do', 'about dot']
};

// ===== STATE =====
let enteredPin = '';
let currentUser = null;
let allClients = [];
let allJobs = [];

// ===== DOM ELEMENTS =====
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// Phone layout elements
const pinScreen = $('pin-screen');
const pinError = $('pin-error');
const homeContent = $('home-content');
const conversationView = $('conversation-view');
const conversationArea = $('conversation-area');
const homeInput = $('home-input');
const chatInput = $('chat-input');
const dropdown = $('dropdown');
const overlay = $('overlay');
const hamburger = $('hamburger');
const examples = $('examples');

// Landscape layout elements
const pinScreenLandscape = $('pin-screen-landscape');
const pinErrorLandscape = $('pin-error-landscape');
const landscapeHome = $('landscape-home');
const landscapeConversation = $('landscape-conversation');
const landscapeConversationArea = $('landscape-conversation-area');
const landscapeInput = $('landscape-input');
const landscapeChatInput = $('landscape-chat-input');
const landscapeFooter = $('landscape-footer');
const dropdownLandscape = $('dropdown-landscape');
const overlayLandscape = $('overlay-landscape');
const hamburgerLandscape = $('hamburger-landscape');

// Helper to check if we're in landscape mode
function isLandscape() {
    return window.innerWidth >= 900;
}

// Get active conversation area based on current layout
function getActiveConversationArea() {
    return isLandscape() ? landscapeConversationArea : conversationArea;
}

// ===== API FUNCTIONS =====
async function loadClients() {
    try {
        const response = await fetch(`${API_BASE}/clients`);
        const data = await response.json();
        allClients = data.map(c => ({
            code: c.code,
            name: c.name
        }));
        console.log('Loaded clients:', allClients.length);
    } catch (e) {
        console.error('Failed to load clients:', e);
        allClients = [];
    }
}

async function loadJobs() {
    try {
        const response = await fetch(`${API_BASE}/jobs/all`);
        allJobs = await response.json();
        console.log('Loaded jobs:', allJobs.length);
    } catch (e) {
        console.error('Failed to load jobs:', e);
        allJobs = [];
    }
}

// ===== QUERY PARSER =====

/**
 * Parse a query into intent and modifiers
 * Returns: { coreRequest, modifiers, searchTerms }
 */
function parseQuery(query) {
    const q = query.toLowerCase().trim();
    
    // Result object
    const result = {
        coreRequest: null,
        modifiers: {
            client: null,
            status: null,
            withClient: null,
            dateRange: null
        },
        searchTerms: [],
        raw: query
    };
    
    // 1. Detect client
    const clientMatch = allClients.find(c => 
        q.includes(c.name.toLowerCase()) || 
        q.includes(c.code.toLowerCase())
    );
    if (clientMatch) {
        result.modifiers.client = clientMatch.code;
    }
    
    // 2. Detect core request (order matters - check most specific first)
    if (matchesKeywords(q, KEYWORDS.HELP)) {
        result.coreRequest = 'HELP';
    } else if (matchesKeywords(q, KEYWORDS.TRACKER)) {
        result.coreRequest = 'TRACKER';
    } else if (matchesKeywords(q, KEYWORDS.UPDATE)) {
        result.coreRequest = 'UPDATE';
    } else if (matchesKeywords(q, KEYWORDS.DUE)) {
        result.coreRequest = 'DUE';
        // Check for date range modifiers
        if (q.includes('today') || q.includes('now')) {
            result.modifiers.dateRange = 'today';
        } else if (q.includes('this week') || q.includes('week')) {
            result.modifiers.dateRange = 'week';
        } else if (q.includes('next')) {
            result.modifiers.dateRange = 'next';
        } else {
            result.modifiers.dateRange = 'today'; // default
        }
    } else if (matchesKeywords(q, KEYWORDS.FIND) || clientMatch) {
        result.coreRequest = 'FIND';
        // Extract search terms if we have a client
        if (clientMatch) {
            result.searchTerms = extractSearchTerms(q, clientMatch);
        }
    }
    
    // 3. Check for status modifiers
    if (q.includes('on hold') || q.includes('hold')) {
        result.modifiers.status = 'On Hold';
    } else if (q.includes('incoming') || q.includes('new')) {
        result.modifiers.status = 'Incoming';
    } else if (q.includes('completed') || q.includes('done')) {
        result.modifiers.status = 'Completed';
    }
    
    // 4. Check for "with client" modifier
    if (q.includes('with client') || q.includes('with them') || q.includes('waiting')) {
        result.modifiers.withClient = true;
    }
    
    // 5. If still no core request but has search-like terms, assume FIND
    if (!result.coreRequest && q.length > 2) {
        result.coreRequest = 'FIND';
        result.searchTerms = extractSearchTermsRaw(q);
    }
    
    return result;
}

function matchesKeywords(query, keywords) {
    return keywords.some(kw => query.includes(kw));
}

// Words to ignore when searching
const STOP_WORDS = ['the', 'a', 'an', 'job', 'project', 'about', 'for', 'with', 'that', 'one', 
    'whats', "what's", 'where', 'is', 'are', 'can', 'you', 'find', 'show', 'me', 'i', 'need', 
    'looking', 'check', 'on', 'how', 'hows', "how's", 'going', 'doing'];

function extractSearchTerms(query, clientMatch) {
    let q = query.toLowerCase();
    // Remove client name and code
    q = q.replace(clientMatch.name.toLowerCase(), '');
    q = q.replace(clientMatch.code.toLowerCase(), '');
    return extractSearchTermsRaw(q);
}

function extractSearchTermsRaw(query) {
    const words = query.split(/\s+/).filter(word => 
        word.length > 2 && !STOP_WORDS.includes(word)
    );
    return words;
}

// ===== APPLY DEFAULTS =====

/**
 * Apply default filters for missing modifiers
 */
function applyDefaults(parsed) {
    // Default status: In Progress
    if (!parsed.modifiers.status) {
        parsed.modifiers.status = 'In Progress';
    }
    
    // Default withClient: false (show jobs with us)
    if (parsed.modifiers.withClient === null) {
        parsed.modifiers.withClient = false;
    }
    
    // Default dateRange for DUE: today (includes overdue)
    if (parsed.coreRequest === 'DUE' && !parsed.modifiers.dateRange) {
        parsed.modifiers.dateRange = 'today';
    }
    
    return parsed;
}

// ===== JOB FILTERING =====

/**
 * Single function to filter jobs based on modifiers
 */
function getFilteredJobs(modifiers, options = {}) {
    let jobs = [...allJobs];
    
    // Filter by client
    if (modifiers.client) {
        jobs = jobs.filter(j => j.clientCode === modifiers.client);
    }
    
    // Filter by status (unless includeAllStatuses)
    if (!options.includeAllStatuses && modifiers.status) {
        jobs = jobs.filter(j => j.status === modifiers.status);
    }
    
    // Filter by withClient
    if (modifiers.withClient === true) {
        jobs = jobs.filter(j => j.withClient === true);
    } else if (modifiers.withClient === false) {
        jobs = jobs.filter(j => !j.withClient);
    }
    
    // Filter by date range
    if (modifiers.dateRange) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        jobs = jobs.filter(j => {
            if (!j.updateDue) return false;
            const dueDate = new Date(j.updateDue);
            dueDate.setHours(0, 0, 0, 0);
            
            switch (modifiers.dateRange) {
                case 'today':
                    // Today + overdue
                    return dueDate <= today;
                case 'week':
                    // Within 7 days + overdue
                    const weekFromNow = new Date(today);
                    weekFromNow.setDate(weekFromNow.getDate() + 7);
                    return dueDate <= weekFromNow;
                case 'next':
                    // Just get all with due dates, we'll sort and take first
                    return true;
                default:
                    return true;
            }
        });
    }
    
    // Sort by due date (soonest first, overdue at top)
    jobs.sort((a, b) => {
        if (!a.updateDue) return 1;
        if (!b.updateDue) return -1;
        return new Date(a.updateDue) - new Date(b.updateDue);
    });
    
    return jobs;
}

/**
 * Search jobs by terms within a client
 */
function searchJobs(modifiers, searchTerms) {
    let jobs = getFilteredJobs({ client: modifiers.client }, { includeAllStatuses: true });
    
    if (searchTerms.length === 0) {
        return jobs;
    }
    
    // Score and filter
    const scored = jobs.map(job => ({
        job,
        score: scoreJobMatch(job, searchTerms)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    
    return scored.map(item => item.job);
}

function scoreJobMatch(job, searchTerms) {
    const jobName = (job.jobName || '').toLowerCase();
    const jobDesc = (job.description || '').toLowerCase();
    const jobUpdate = (job.update || '').toLowerCase();
    
    let score = 0;
    for (const term of searchTerms) {
        if (jobName.includes(term)) score += 10;
        if (jobDesc.includes(term)) score += 5;
        if (jobUpdate.includes(term)) score += 2;
    }
    return score;
}

// ===== EXECUTE =====

/**
 * Main entry point - process a question
 */
function processQuestion(question) {
    addThinkingDots();
    
    setTimeout(() => {
        removeThinkingDots();
        
        // Check easter eggs first
        const easterEgg = checkEasterEggs(question);
        if (easterEgg === 'EASTER_WISHES') {
            renderResponse({
                text: "So you did read the prompt. Sorry to disappoint, best wish I can do is hope you're smiling. 😊",
                prompts: ['Check a client', "What's due?"]
            });
            conversationArea.scrollTop = conversationArea.scrollHeight;
            return;
        }
        
        // 1. Parse
        let parsed = parseQuery(question);
        
        // 2. Apply defaults
        parsed = applyDefaults(parsed);
        
        // 3. Execute based on core request
        switch (parsed.coreRequest) {
            case 'DUE':
                executeDue(parsed);
                break;
            case 'FIND':
                executeFind(parsed);
                break;
            case 'UPDATE':
                executeUpdate(parsed);
                break;
            case 'TRACKER':
                executeTracker(parsed);
                break;
            case 'HELP':
                executeHelp();
                break;
            default:
                // No match - future: ask Claude
                executeHelp();
        }
        
        conversationArea.scrollTop = conversationArea.scrollHeight;
        if (landscapeConversationArea) landscapeConversationArea.scrollTop = landscapeConversationArea.scrollHeight;
    }, 600);
}

// ===== EXECUTORS =====

function executeDue(parsed) {
    const jobs = getFilteredJobs(parsed.modifiers);
    const client = parsed.modifiers.client 
        ? allClients.find(c => c.code === parsed.modifiers.client)
        : null;
    
    // Special case: "next" means just show the single next job
    if (parsed.modifiers.dateRange === 'next') {
        if (jobs.length === 0) {
            renderResponse({
                text: client 
                    ? `No upcoming deadlines for ${client.name}.`
                    : 'No upcoming deadlines.',
                prompts: ['Check a client', "What's due today?"]
            });
        } else {
            const nextJob = jobs[0];
            renderResponse({
                text: `Next up is <strong>${nextJob.jobNumber} — ${nextJob.jobName}</strong>, due ${formatDueDate(nextJob.updateDue)}.`,
                jobs: [nextJob],
                prompts: client 
                    ? ['Due today', `More ${client.name} jobs`]
                    : ['Due today', 'Check a client']
            });
        }
        return;
    }
    
    // Standard due response
    const dateLabel = parsed.modifiers.dateRange === 'week' ? 'this week' : 'today';
    
    if (jobs.length === 0) {
        renderResponse({
            text: client 
                ? `Nothing due ${dateLabel} for ${client.name}! 🎉`
                : `Nothing due ${dateLabel}! 🎉`,
            prompts: ['Due this week', 'On hold?', 'With client?']
        });
    } else {
        renderResponse({
            text: client
                ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} due ${dateLabel} for ${client.name}:`
                : `${jobs.length} job${jobs.length === 1 ? '' : 's'} due ${dateLabel}:`,
            jobs: jobs,
            prompts: ['Due this week', 'On hold?', 'With client?']
        });
    }
}

function executeFind(parsed) {
    // No client specified - show client picker
    if (!parsed.modifiers.client) {
        renderClientPicker();
        return;
    }
    
    const client = allClients.find(c => c.code === parsed.modifiers.client);
    
    // Has search terms - fuzzy search
    if (parsed.searchTerms.length > 0) {
        const jobs = searchJobs(parsed.modifiers, parsed.searchTerms);
        
        if (jobs.length === 0) {
            renderResponse({
                text: `Couldn't find a ${client?.name || parsed.modifiers.client} job matching that.`,
                prompts: [`All ${client?.name} jobs`, 'Check another client']
            });
        } else if (jobs.length === 1) {
            renderResponse({
                text: `I think you mean <strong>${jobs[0].jobNumber} — ${jobs[0].jobName}</strong>?`,
                jobs: [jobs[0]],
                prompts: [`All ${client?.name} jobs`, 'Check another client']
            });
        } else {
            renderResponse({
                text: `Found ${jobs.length} ${client?.name} jobs that might match:`,
                jobs: jobs.slice(0, 3),
                prompts: [`All ${client?.name} jobs`, 'Check another client']
            });
        }
        return;
    }
    
    // No search terms - show all jobs for client
    const jobs = getFilteredJobs(parsed.modifiers);
    
    if (jobs.length === 0) {
        renderResponse({
            text: `No active jobs for ${client?.name || parsed.modifiers.client}.`,
            prompts: ['On hold?', 'With client?', 'Check another client']
        });
    } else {
        renderResponse({
            text: `Here's what's on for ${client?.name || parsed.modifiers.client}:`,
            jobs: jobs,
            prompts: ['On hold?', 'With client?', 'Check another client']
        });
    }
}

function executeUpdate(parsed) {
    // If we have a client, help them find the job
    if (parsed.modifiers.client) {
        const client = allClients.find(c => c.code === parsed.modifiers.client);
        renderResponse({
            text: `Which ${client?.name} job do you want to update?`,
            prompts: [`Show ${client?.name} jobs`, 'Check another client']
        });
    } else {
        renderResponse({
            text: "Which job do you want to update? Tell me the client and I'll help you find it.",
            prompts: ['Check a client']
        });
    }
}

function executeTracker(parsed) {
    renderResponse({
        text: "Tracker is coming soon! 🚀",
        prompts: ['Check a client', "What's due?"]
    });
}

function executeHelp() {
    renderResponse({
        text: `I'm Dot, I'm here to help you:
            <br><br>• Check on jobs and client work.
            <br>• See what's due or coming up.
            <br>• Easily find info on any job.
            <br><br>I'm a robot, not a genie, so go easy.`,
        prompts: ['Check a client', "What's due?", 'Grant three wishes']
    });
}

// ===== RENDERERS =====

function renderResponse({ text, jobs = [], prompts = [] }) {
    const area = getActiveConversationArea();
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    
    let html = `<p class="dot-text">${text}</p>`;
    
    if (jobs.length > 0) {
        html += '<div class="job-cards">';
        jobs.forEach((job, i) => {
            html += createJobCard(job, i);
        });
        html += '</div>';
    }
    
    if (prompts.length > 0) {
        html += '<div class="smart-prompts">';
        prompts.forEach(prompt => {
            html += `<button class="smart-prompt" data-question="${prompt}">${prompt}</button>`;
        });
        html += '</div>';
    }
    
    response.innerHTML = html;
    area.appendChild(response);
    bindDynamicElements(response);
}

function renderClientPicker() {
    const area = getActiveConversationArea();
    const allClientsWithCounts = getClientsWithJobCounts();
    const keyClients = allClientsWithCounts.filter(c => KEY_CLIENTS.includes(c.code));
    const hasOtherClients = allClientsWithCounts.some(c => !KEY_CLIENTS.includes(c.code));
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Which client?</p>
        <div class="client-cards">
            ${keyClients.map(c => `
                <div class="client-card" data-client="${c.code}">
                    <div>
                        <div class="client-name">${getClientDisplayName(c)}</div>
                        <div class="client-count">${c.jobCount} active job${c.jobCount === 1 ? '' : 's'}</div>
                    </div>
                    <span class="card-chevron">›</span>
                </div>
            `).join('')}
            ${hasOtherClients ? `
                <div class="client-card other-clients-btn">
                    <div>
                        <div class="client-name">Other clients</div>
                    </div>
                    <span class="card-chevron">›</span>
                </div>
            ` : ''}
        </div>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="What's due today?">What's due?</button>
        </div>
    `;
    area.appendChild(response);
    bindDynamicElements(response);
}

function getClientsWithJobCounts() {
    return allClients.map(c => ({
        ...c,
        jobCount: allJobs.filter(j => j.clientCode === c.code && j.status === 'In Progress').length
    })).filter(c => c.jobCount > 0);
}

// ===== JOB CARD =====

function createJobCard(job, index) {
    const id = `job-${Date.now()}-${index}`;
    const dueDate = formatDueDate(job.updateDue);
    const lastUpdated = formatLastUpdated(job.lastUpdated);
    
    const clockIcon = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    const withClientIcon = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
    
    return `
        <div class="job-card" id="${id}">
            <div class="job-card-header" data-job-id="${id}">
                <div class="job-info">
                    <div class="job-title">${job.jobNumber} | ${job.jobName}</div>
                    <div class="job-meta">
                        ${clockIcon} ${dueDate}
                        ${job.withClient ? `<span class="job-meta-dot"></span>${withClientIcon} With Client` : ''}
                    </div>
                </div>
                <span class="card-chevron">›</span>
            </div>
            <div class="job-details">
                <textarea class="job-update-input" data-job="${job.jobNumber}" placeholder="Add an update...">${job.update || ''}</textarea>
                <div class="job-detail-row">
                    <span class="job-detail-label">Owner</span>
                    <span class="job-detail-value">${job.projectOwner || 'TBC'}</span>
                </div>
                <div class="job-detail-row">
                    <span class="job-detail-label">Updated</span>
                    <span class="job-detail-value">${lastUpdated}</span>
                </div>
                <div class="job-actions">
                    ${job.channelUrl ? `<a href="${job.channelUrl}" target="_blank" class="job-action-btn secondary">Teams →</a>` : ''}
                    <button class="job-action-btn primary" data-job="${job.jobNumber}" onclick="submitUpdate('${job.jobNumber}', this)">Update →</button>
                </div>
            </div>
        </div>
    `;
}

// ===== HELPERS =====

function formatDueDate(isoDate) {
    if (!isoDate) return 'TBC';
    const date = new Date(isoDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    if (dateOnly.getTime() === today.getTime()) return 'Today';
    if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';
    if (dateOnly < today) return 'Overdue';
    
    return date.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatLastUpdated(isoDate) {
    if (!isoDate) return 'No updates';
    const date = new Date(isoDate);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    return `${Math.floor(diffDays / 7)} weeks ago`;
}

// ===== UPDATE SUBMISSION =====

async function submitUpdate(jobNumber, btn) {
    const card = btn.closest('.job-card');
    const textarea = card.querySelector('.job-update-input');
    const message = textarea.value.trim();
    
    if (!message) {
        textarea.focus();
        return;
    }
    
    // Optimistic UI - update card immediately
    const originalText = textarea.value;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const response = await fetch(`${PROXY_BASE}/proxy/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientCode: jobNumber.split(' ')[0],
                jobNumber: jobNumber,
                message: message
            })
        });
        
        if (!response.ok) throw new Error('Update failed');
        
        btn.textContent = 'Done ✓';
        btn.classList.add('success');
        
        // Update local data optimistically
        const job = allJobs.find(j => j.jobNumber === jobNumber);
        if (job) {
            job.update = message;
            job.lastUpdated = new Date().toISOString();
        }
        
        setTimeout(() => {
            btn.textContent = 'Update →';
            btn.classList.remove('success');
            btn.disabled = false;
        }, 2000);
        
    } catch (e) {
        console.error('Update failed:', e);
        btn.textContent = 'Failed';
        textarea.value = originalText;
        setTimeout(() => {
            btn.textContent = 'Update →';
            btn.disabled = false;
        }, 2000);
    }
}

// ===== UI FUNCTIONS =====

function addUserMessage(text) {
    const area = getActiveConversationArea();
    const msg = document.createElement('div');
    msg.className = 'user-message fade-in';
    msg.textContent = text;
    area.appendChild(msg);
    area.scrollTop = area.scrollHeight;
}

function addThinkingDots() {
    const area = getActiveConversationArea();
    const dots = document.createElement('div');
    dots.className = 'thinking-dots';
    dots.id = 'currentThinking';
    dots.innerHTML = `
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
    `;
    area.appendChild(dots);
    area.scrollTop = area.scrollHeight;
}

function removeThinkingDots() {
    const dots = $('currentThinking');
    if (dots) dots.remove();
}

function toggleJobCard(id) {
    $(id).classList.toggle('expanded');
}

// ===== EVENT BINDING =====

function bindDynamicElements(container) {
    // Smart prompts
    container.querySelectorAll('.smart-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            addUserMessage(question);
            processQuestion(question);
        });
    });
    
    // Client cards
    container.querySelectorAll('.client-card:not(.other-clients-btn)').forEach(card => {
        card.addEventListener('click', () => {
            const clientCode = card.dataset.client;
            const client = allClients.find(c => c.code === clientCode);
            addUserMessage(client?.name || clientCode);
            processQuestion(client?.name || clientCode);
        });
    });
    
    // Other clients button
    container.querySelectorAll('.other-clients-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            addUserMessage('Other clients');
            showOtherClients();
        });
    });
    
    // Job card headers
    container.querySelectorAll('.job-card-header').forEach(header => {
        header.addEventListener('click', () => {
            toggleJobCard(header.dataset.jobId);
        });
    });
}

function showOtherClients() {
    const area = getActiveConversationArea();
    addThinkingDots();
    setTimeout(() => {
        removeThinkingDots();
        const otherClients = getClientsWithJobCounts().filter(c => !KEY_CLIENTS.includes(c.code));
        
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">Other clients:</p>
            <div class="client-cards">
                ${otherClients.map(c => `
                    <div class="client-card" data-client="${c.code}">
                        <div>
                            <div class="client-name">${getClientDisplayName(c)}</div>
                            <div class="client-count">${c.jobCount} active job${c.jobCount === 1 ? '' : 's'}</div>
                        </div>
                        <span class="card-chevron">›</span>
                    </div>
                `).join('')}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Check a client">Back to main clients</button>
            </div>
        `;
        area.appendChild(response);
        bindDynamicElements(response);
        area.scrollTop = area.scrollHeight;
    }, 400);
}

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
    // Update phone PIN dots
    for (let i = 0; i < 4; i++) {
        const dot = $('dot-' + i);
        if (dot) {
            dot.classList.remove('filled', 'error');
            if (i < enteredPin.length) {
                dot.classList.add('filled');
            }
        }
    }
    // Update landscape PIN dots
    for (let i = 0; i < 4; i++) {
        const dot = $('dot-landscape-' + i);
        if (dot) {
            dot.classList.remove('filled', 'error');
            if (i < enteredPin.length) {
                dot.classList.add('filled');
            }
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
        // Show error on both layouts
        $$('.pin-dot').forEach(d => d.classList.add('error'));
        if (pinError) pinError.classList.add('visible');
        if (pinErrorLandscape) pinErrorLandscape.classList.add('visible');
        setTimeout(() => {
            enteredPin = '';
            updatePinDots();
        }, 500);
    }
}

function unlockApp() {
    // Hide PIN screens on both layouts
    if (pinScreen) pinScreen.classList.add('hidden');
    if (pinScreenLandscape) pinScreenLandscape.classList.add('hidden');
    
    // Set personalized placeholder on both inputs
    const placeholder = `What's cooking ${currentUser.name}?`;
    if (homeInput) homeInput.placeholder = placeholder;
    if (landscapeInput) landscapeInput.placeholder = placeholder;
    
    loadClients();
    loadJobs();
}

function signOut() {
    closeMenu();
    sessionStorage.removeItem('dotUser');
    currentUser = null;
    enteredPin = '';
    updatePinDots();
    
    // Show PIN screens on both layouts
    if (pinScreen) pinScreen.classList.remove('hidden');
    if (pinScreenLandscape) pinScreenLandscape.classList.remove('hidden');
    
    goHome();
}

function checkSession() {
    const stored = sessionStorage.getItem('dotUser');
    if (stored) {
        currentUser = JSON.parse(stored);
        unlockApp();
    }
}

// ===== NAVIGATION =====

function goHome() {
    // Phone layout
    if (homeContent) homeContent.classList.remove('hidden');
    if (conversationView) conversationView.classList.remove('visible');
    if (homeInput) homeInput.value = '';
    if (conversationArea) conversationArea.innerHTML = '';
    
    // Landscape layout
    if (landscapeHome) landscapeHome.classList.remove('hidden');
    if (landscapeConversation) landscapeConversation.classList.remove('visible');
    if (landscapeInput) landscapeInput.value = '';
    if (landscapeConversationArea) landscapeConversationArea.innerHTML = '';
    if (landscapeFooter) landscapeFooter.classList.remove('hidden');
    
    loadClients();
    loadJobs();
}

function startConversation() {
    if (isLandscape()) {
        // Landscape layout
        const question = landscapeInput.value.trim() || 'Check a client';
        landscapeHome.classList.add('hidden');
        landscapeConversation.classList.add('visible');
        landscapeFooter.classList.add('hidden');
        addUserMessage(question);
        processQuestion(question);
    } else {
        // Phone layout
        const question = homeInput.value.trim() || 'Check a client';
        homeContent.classList.add('hidden');
        conversationView.classList.add('visible');
        addUserMessage(question);
        processQuestion(question);
    }
}

function continueConversation() {
    const input = isLandscape() ? landscapeChatInput : chatInput;
    const question = input.value.trim();
    if (!question) return;
    addUserMessage(question);
    input.value = '';
    processQuestion(question);
}

// ===== MENU =====

function toggleMenu() {
    if (isLandscape()) {
        hamburgerLandscape.classList.toggle('open');
        dropdownLandscape.classList.toggle('open');
        overlayLandscape.classList.toggle('open');
    } else {
        hamburger.classList.toggle('open');
        dropdown.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

function closeMenu() {
    // Close both layouts' menus
    if (hamburger) hamburger.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    if (hamburgerLandscape) hamburgerLandscape.classList.remove('open');
    if (dropdownLandscape) dropdownLandscape.classList.remove('open');
    if (overlayLandscape) overlayLandscape.classList.remove('open');
}

function menuAction(action) {
    closeMenu();
    const isMobile = window.innerWidth <= 440;
    
    switch(action) {
        case 'wip':
            if (isMobile) {
                homeContent.classList.add('hidden');
                conversationView.classList.add('visible');
                renderResponse({
                    text: 'WIP works best on a bigger screen. Try it on desktop!',
                    prompts: ['Check a client', "What's due?"]
                });
            } else {
                window.open('https://dot.hunch.co.nz/todo.html', '_blank');
            }
            break;
        case 'tracker':
            if (isMobile) {
                homeContent.classList.add('hidden');
                conversationView.classList.add('visible');
                renderResponse({
                    text: 'Tracker works best on a bigger screen. Try it on desktop!',
                    prompts: ['Check a client', "What's due?"]
                });
            } else {
                window.open('https://dot.hunch.co.nz/tracker.html', '_blank');
            }
            break;
        case 'about':
            homeContent.classList.add('hidden');
            conversationView.classList.add('visible');
            addUserMessage('What can Dot do?');
            processQuestion('What can Dot do?');
            break;
        case 'signout':
            signOut();
            break;
    }
}

// ===== EASTER EGGS =====

// Add to parseQuery - check for easter eggs
function checkEasterEggs(query) {
    const q = query.toLowerCase();
    if (q.includes('three wishes') || q.includes('3 wishes') || q.includes('genie')) {
        return 'EASTER_WISHES';
    }
    return null;
}

// ===== INITIALIZATION =====

function init() {
    checkSession();
    
    // PIN keypad - both layouts
    $$('.pin-key[data-digit]').forEach(key => {
        key.addEventListener('click', () => {
            enterPin(parseInt(key.dataset.digit));
        });
    });
    
    // PIN delete buttons
    if ($('pin-delete')) $('pin-delete').addEventListener('click', deletePin);
    if ($('pin-delete-landscape')) $('pin-delete-landscape').addEventListener('click', deletePin);
    
    // Menu - phone
    if (hamburger) hamburger.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);
    
    // Menu - landscape
    if (hamburgerLandscape) hamburgerLandscape.addEventListener('click', toggleMenu);
    if (overlayLandscape) overlayLandscape.addEventListener('click', closeMenu);
    
    // Dropdown items - both layouts
    $$('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            menuAction(item.dataset.action);
        });
    });
    
    // Home buttons
    if ($('home-btn')) $('home-btn').addEventListener('click', goHome);
    if ($('home-btn-landscape')) $('home-btn-landscape').addEventListener('click', goHome);
    
    // Phone home input
    if (homeInput) {
        homeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') startConversation();
        });
    }
    if ($('home-send')) $('home-send').addEventListener('click', startConversation);
    
    // Landscape home input
    if (landscapeInput) {
        landscapeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') startConversation();
        });
    }
    if ($('landscape-send')) $('landscape-send').addEventListener('click', startConversation);
    
    // Phone chat input
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') continueConversation();
        });
    }
    if ($('chat-send')) $('chat-send').addEventListener('click', continueConversation);
    
    // Landscape chat input
    if (landscapeChatInput) {
        landscapeChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') continueConversation();
        });
    }
    if ($('landscape-chat-send')) $('landscape-chat-send').addEventListener('click', continueConversation);
    
    // Example buttons - both layouts
    $$('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isLandscape()) {
                landscapeInput.value = btn.dataset.question;
            } else {
                homeInput.value = btn.dataset.question;
            }
            startConversation();
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
