/**
 * Ask Dot - Frontend Application
 * Handles PIN authentication, conversation flow, and UI interactions
 */

// ===== CONFIGURATION =====
const API_BASE = 'https://dot-remote-api.up.railway.app';

// PIN Database - just Michael for now
// Later: move to Airtable via API
const PINS = {
    '9871': { name: 'Michael', fullName: 'Michael Goldthorpe', client: 'ALL', clientName: 'Hunch', mode: 'hunch' }
};

// Data loaded from API
let allClients = [];
let allJobs = [];

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
const dropdown = $('dropdown');
const overlay = $('overlay');
const hamburger = $('hamburger');
const examples = $('examples');

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

function getJobsForClient(clientCode) {
    return allJobs.filter(j => j.clientCode === clientCode);
}

function getClientsWithJobCounts() {
    return allClients.map(c => ({
        ...c,
        jobCount: allJobs.filter(j => j.clientCode === c.code).length
    })).filter(c => c.jobCount > 0);
}

function formatDueDate(isoDate) {
    if (!isoDate) return 'TBC';
    const date = new Date(isoDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
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

// Words to ignore when searching
const STOP_WORDS = ['the', 'a', 'an', 'job', 'project', 'about', 'for', 'with', 'that', 'one', 'whats', "what's", 'where', 'is', 'are', 'can', 'you', 'find', 'show', 'me', 'i', 'need', 'looking'];

function extractSearchTerms(query, clientMatch) {
    // Remove client name and code from query
    let q = query.toLowerCase();
    q = q.replace(clientMatch.name.toLowerCase(), '');
    q = q.replace(clientMatch.code.toLowerCase(), '');
    
    // Split into words and filter out stop words
    const words = q.split(/\s+/).filter(word => 
        word.length > 2 && !STOP_WORDS.includes(word)
    );
    
    return words;
}

function scoreJobMatch(job, searchTerms) {
    const jobName = job.jobName.toLowerCase();
    const jobDesc = (job.description || '').toLowerCase();
    const jobUpdate = (job.update || '').toLowerCase();
    
    let score = 0;
    
    for (const term of searchTerms) {
        // Exact match in job name scores highest
        if (jobName.includes(term)) {
            score += 10;
        }
        // Match in description
        if (jobDesc.includes(term)) {
            score += 5;
        }
        // Match in update
        if (jobUpdate.includes(term)) {
            score += 2;
        }
    }
    
    return score;
}

function searchJobsForClient(clientCode, searchTerms) {
    const clientJobs = getJobsForClient(clientCode);
    const client = allClients.find(c => c.code === clientCode);
    
    // Score all jobs
    const scoredJobs = clientJobs.map(job => ({
        job,
        score: scoreJobMatch(job, searchTerms)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    
    if (scoredJobs.length === 0) {
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I couldn't find a ${client?.name || clientCode} job matching that. Here's everything for ${client?.name || clientCode}:</p>
            <div class="job-cards">
                ${clientJobs.slice(0, 5).map((job, i) => createJobCard(job, i)).join('')}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Check a client">Try another client</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
        return;
    }
    
    if (scoredJobs.length === 1 || scoredJobs[0].score > scoredJobs[1]?.score * 1.5) {
        // Clear winner
        const bestJob = scoredJobs[0].job;
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I think you mean <strong>${bestJob.jobNumber} — ${bestJob.jobName}</strong>?</p>
            <div class="job-cards">
                ${createJobCard(bestJob, 0)}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="${client?.name || clientCode} jobs">See all ${client?.name || clientCode} jobs</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
    } else {
        // Multiple matches
        const topMatches = scoredJobs.slice(0, 3);
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I found a few ${client?.name || clientCode} jobs that might match:</p>
            <div class="job-cards">
                ${topMatches.map((item, i) => createJobCard(item.job, i)).join('')}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="${client?.name || clientCode} jobs">See all ${client?.name || clientCode} jobs</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
    }
}

function searchAllJobs(query) {
    // Extract search terms (remove stop words)
    const words = query.toLowerCase().split(/\s+/).filter(word => 
        word.length > 2 && !STOP_WORDS.includes(word)
    );
    
    if (words.length === 0) {
        showFindJob();
        return;
    }
    
    // Score all jobs
    const scoredJobs = allJobs.map(job => ({
        job,
        score: scoreJobMatch(job, words)
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    
    if (scoredJobs.length === 0) {
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I couldn't find a job matching that. Try including the client name, like "the Tower job about cross-sell".</p>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Check a client">Check a client</button>
                <button class="smart-prompt" data-question="What's due today?">What's due today?</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
        return;
    }
    
    if (scoredJobs.length === 1 || scoredJobs[0].score > scoredJobs[1]?.score * 1.5) {
        // Clear winner
        const bestJob = scoredJobs[0].job;
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I think you mean <strong>${bestJob.jobNumber} — ${bestJob.jobName}</strong>?</p>
            <div class="job-cards">
                ${createJobCard(bestJob, 0)}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Find a job">Find another job</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
    } else {
        // Multiple matches
        const topMatches = scoredJobs.slice(0, 3);
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">I found a few jobs that might match:</p>
            <div class="job-cards">
                ${topMatches.map((item, i) => createJobCard(item.job, i)).join('')}
            </div>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Find a job">Find another job</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
    }
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
    homeInput.placeholder = `What's cooking ${currentUser.name}?`;
    updateExamplesForUser();
    // Load data after unlock
    loadClients();
    loadJobs();
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
    const isMobile = window.innerWidth <= 440;
    
    switch(action) {
        case 'wip':
            if (isMobile) {
                showDesktopPrompt('WIP');
            } else {
                window.open('https://dot.hunch.co.nz/todo.html', '_blank');
            }
            break;
        case 'tracker':
            if (isMobile) {
                showDesktopPrompt('Tracker');
            } else {
                window.open('https://dot.hunch.co.nz/tracker.html', '_blank');
            }
            break;
        case 'about':
            askQuestion('What can Dot do?');
            break;
        case 'signout':
            signOut();
            break;
    }
}

function showDesktopPrompt(tool) {
    // Show conversation view with desktop message
    homeContent.classList.add('hidden');
    conversationView.classList.add('visible');
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">${tool} works best on a bigger screen. Try it on desktop!</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Find a job">Find a job</button>
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
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
        
        // Check for client name in query
        const clientMatch = allClients.find(c => 
            q.includes(c.name.toLowerCase()) || 
            q.includes(c.code.toLowerCase())
        );
        
        if (currentUser && currentUser.mode === 'client') {
            // Client mode - restricted view
            const clientCode = currentUser.client === 'ONS' ? 'ONE' : currentUser.client;
            
            if (q.includes('overdue') || q.includes('late') || q.includes('behind')) {
                showOverdueJobs(clientCode);
            } else if ((q.includes('due') || q.includes('deadline')) && q.includes('today')) {
                showDueToday(clientCode);
            } else if (q.includes('next') || q.includes('coming up')) {
                showDueNext(clientCode);
            } else if (q.includes('wip') || q.includes('jobs') || q.includes('my jobs')) {
                showJobsForClient(clientCode);
            } else if (q.includes('what can dot do') || q.includes('about dot') || q.includes('help')) {
                showAboutDot();
            } else {
                // Default for client mode - show their jobs
                showJobsForClient(clientCode);
            }
        } else {
            // Hunch mode - full access
            
            // 1. Specific requests first
            if ((q.includes('due') || q.includes('deadline')) && q.includes('today')) {
                showDueToday();
            } else if ((q.includes('next') && (q.includes('due') || q.includes('deadline') || q.includes('what'))) || q.includes('coming up')) {
                showDueNext();
            } else if (q.includes('overdue') || q.includes('late') || q.includes('behind')) {
                if (clientMatch) {
                    showOverdueJobs(clientMatch.code);
                } else {
                    showClientPicker('overdue');
                }
            } else if (q.includes('wip')) {
                if (clientMatch) {
                    showJobsForClient(clientMatch.code);
                } else {
                    showClientPicker();
                }
            } else if (q.includes('find a job') || q.includes('find job') || q.includes('search')) {
                showFindJob();
            } else if (q.includes('check a client') || q.includes('check client')) {
                showClientPicker();
            } else if (q.includes('three wishes') || q.includes('3 wishes') || q.includes('genie')) {
                showThreeWishes();
            } else if (q.includes('what can dot do') || q.includes('about dot') || q.includes('help')) {
                showAboutDot();
            } else if (q.includes('tracker')) {
                showTrackerComingSoon();
            } 
            // 2. Client name found - try to find a specific job or show all
            else if (clientMatch) {
                const searchTerms = extractSearchTerms(q, clientMatch);
                if (searchTerms.length > 0) {
                    searchJobsForClient(clientMatch.code, searchTerms);
                } else {
                    showJobsForClient(clientMatch.code);
                }
            }
            // 3. No client but maybe searching for a job by description
            else if (q.includes('job') || q.includes('project') || q.includes('the one about') || q.includes('that one')) {
                searchAllJobs(q);
            }
            // 4. Nothing matched
            else {
                showDefaultResponse(question);
            }
        }
        
        conversationArea.scrollTop = conversationArea.scrollHeight;
    }, 800);
}

// ===== RESPONSE GENERATORS =====
function showClientPicker(filter = '') {
    const clients = currentUser.mode === 'hunch' ? getClientsWithJobCounts() : 
        getClientsWithJobCounts().filter(c => c.code === currentUser.client);
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Which client?</p>
        <div class="client-cards">
            ${clients.map(c => `
                <div class="client-card" data-client="${c.code}" data-filter="${filter}">
                    <div>
                        <div class="client-name">${c.name}</div>
                        <div class="client-count">${c.jobCount} active job${c.jobCount === 1 ? '' : 's'}</div>
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
    const client = allClients.find(c => c.code === code);
    addUserMessage(client ? client.name : code);
    addThinkingDots();
    
    setTimeout(() => {
        removeThinkingDots();
        if (filter === 'overdue') {
            showOverdueJobs(code);
        } else {
            showJobsForClient(code);
        }
        conversationArea.scrollTop = conversationArea.scrollHeight;
    }, 600);
}

function showJobsForClient(code) {
    const clientJobs = getJobsForClient(code);
    const client = allClients.find(c => c.code === code);
    
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const clientJobs = getJobsForClient(code).filter(j => {
        if (j.withClient) return true;
        if (!j.updateDue) return false;
        const dueDate = new Date(j.updateDue);
        return dueDate <= today;
    });
    
    const client = allClients.find(c => c.code === code);
    
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

function showDueToday(clientCode = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get jobs due today
    let dueTodayJobs = allJobs.filter(j => {
        if (!j.updateDue) return false;
        const dueDate = new Date(j.updateDue);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === today.getTime();
    });
    
    // Filter by client if specified
    if (clientCode) {
        dueTodayJobs = dueTodayJobs.filter(j => j.clientCode === clientCode);
    }
    
    if (dueTodayJobs.length === 0) {
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">Nothing due today! 🎉</p>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="What's due next?">What's due next?</button>
                <button class="smart-prompt" data-question="Show me WIP">Show me WIP</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
        return;
    }
    
    const firstJob = dueTodayJobs[0];
    const restJobs = dueTodayJobs.slice(1);
    
    let html = `
        <p class="dot-text"><strong>${firstJob.jobNumber} — ${firstJob.jobName}</strong> is due today.</p>
        <div class="job-cards">
            ${createJobCard(firstJob, 0)}
        </div>
    `;
    
    if (restJobs.length > 0) {
        html += `
            <p class="dot-text" style="margin-top: 16px;">But there's ${restJobs.length > 1 ? 'a few more' : 'one more'} behind the same eightball:</p>
            <ul class="also-due-list">
                ${restJobs.map(j => `<li><strong>${j.jobNumber}</strong> — ${j.jobName}</li>`).join('')}
            </ul>
        `;
    }
    
    html += `
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="What's due next?">What's due next?</button>
            <button class="smart-prompt" data-question="Show me WIP">Show me WIP</button>
        </div>
    `;
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = html;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showDueNext(clientCode = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get jobs with due dates in the future, sorted by date
    let upcomingJobs = allJobs.filter(j => {
        if (!j.updateDue) return false;
        const dueDate = new Date(j.updateDue);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today;
    });
    
    // Filter by client if specified
    if (clientCode) {
        upcomingJobs = upcomingJobs.filter(j => j.clientCode === clientCode);
    }
    
    // Sort by due date
    upcomingJobs.sort((a, b) => new Date(a.updateDue) - new Date(b.updateDue));
    
    if (upcomingJobs.length === 0) {
        const response = document.createElement('div');
        response.className = 'dot-response fade-in';
        response.innerHTML = `
            <p class="dot-text">No upcoming deadlines in the system.</p>
            <div class="smart-prompts">
                <button class="smart-prompt" data-question="Show me WIP">Show me WIP</button>
            </div>
        `;
        conversationArea.appendChild(response);
        bindDynamicElements(response);
        return;
    }
    
    const nextJob = upcomingJobs[0];
    const dueDate = formatDueDate(nextJob.updateDue);
    
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">Next up is <strong>${nextJob.jobNumber} — ${nextJob.jobName}</strong>, due ${dueDate}.</p>
        <div class="job-cards">
            ${createJobCard(nextJob, 0)}
        </div>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="What's due today?">Due today</button>
            <button class="smart-prompt" data-question="Show me WIP">Show me WIP</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function createJobCard(job, index) {
    const id = `job-${Date.now()}-${index}`;
    const dueDate = formatDueDate(job.updateDue);
    const lastUpdated = formatLastUpdated(job.lastUpdated);
    
    // SVG icons
    const clockIcon = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    
    const withClientIcon = `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
    
    return `
        <div class="job-card" id="${id}">
            <div class="job-card-header" data-job-id="${id}">
                <div class="job-info">
                    <div class="job-title">${job.jobNumber} — ${job.jobName}</div>
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
                    ${job.channelUrl ? `<a href="${job.channelUrl}" target="_blank" class="job-action-btn secondary">Open in Teams →</a>` : ''}
                    ${currentUser.mode === 'hunch' ? `<button class="job-action-btn primary" data-job="${job.jobNumber}" onclick="submitUpdate('${job.jobNumber}', this)">Update →</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

function toggleJobCard(id) {
    $(id).classList.toggle('expanded');
}

async function submitUpdate(jobNumber, btn) {
    const card = btn.closest('.job-card');
    const textarea = card.querySelector('.job-update-input');
    const message = textarea.value.trim();
    
    if (!message) {
        textarea.focus();
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        // POST to proxy which sends to N8N
        const response = await fetch('https://dot-proxy.up.railway.app/proxy/update', {
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
        
        setTimeout(() => {
            btn.textContent = 'Update →';
            btn.classList.remove('success');
            btn.disabled = false;
        }, 2000);
        
    } catch (e) {
        console.error('Update failed:', e);
        btn.textContent = 'Failed';
        setTimeout(() => {
            btn.textContent = 'Update →';
            btn.disabled = false;
        }, 2000);
    }
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
        <p class="dot-text">I'm Dot, I'm here to help you:</p>
        <p class="dot-text" style="margin-bottom: 8px;">
            • Check on jobs and client work.<br>
            • See what's due or coming up.<br>
            • Easily find info on any job.
        </p>
        <p class="dot-text">I'm a robot, not a genie, so go easy.</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Find a job">Find a job</button>
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
            <button class="smart-prompt" data-question="Grant three wishes">Grant three wishes</button>
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
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showFindJob() {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">What job are you looking for? Try typing a job number like <strong>SKY 014</strong> or tell me the client and I'll show you what's on.</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
            <button class="smart-prompt" data-question="What's due today?">What's due today?</button>
        </div>
    `;
    conversationArea.appendChild(response);
    bindDynamicElements(response);
}

function showThreeWishes() {
    const response = document.createElement('div');
    response.className = 'dot-response fade-in';
    response.innerHTML = `
        <p class="dot-text">So you did read the prompt. Sorry to disappoint, best wish I can do is hope you're smiling. 😊</p>
        <div class="smart-prompts">
            <button class="smart-prompt" data-question="Find a job">Find a job</button>
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
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
            <button class="smart-prompt" data-question="Find a job">Find a job</button>
            <button class="smart-prompt" data-question="Check a client">Check a client</button>
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
    
    $('chat-send').addEventListener('click', continueConversation);
    
    // Example buttons
    bindExampleButtons();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
