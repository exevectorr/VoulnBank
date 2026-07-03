// VulnBank - Main JavaScript
// Contains vulnerable code for testing purposes

// Global state
let currentUser = null;

// Check login status on page load
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        const user = await res.json();
        
        if (user.error) {
            // Not logged in - redirect to login unless on login page
            if (!window.location.pathname.includes('login.html') && window.location.pathname !== '/') {
                window.location.href = '/';
            }
        } else {
            currentUser = user;
            updateNavUser();
            return user;
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
    return null;
}

// Update navigation user info
function updateNavUser() {
    const navUser = document.getElementById('navUser');
    if (navUser && currentUser) {
        navUser.textContent = `${currentUser.username} (${currentUser.role})`;
    }
}

// Logout function
function logout() {
    // Clear all cookies
    document.cookie.split(';').forEach(c => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
    });
    window.location.href = '/';
}

// Load dashboard data
async function loadDashboard() {
    const user = await checkAuth();
    if (!user) return;
    
    document.getElementById('userName').textContent = user.full_name || user.username;
    document.getElementById('balance').textContent = `$${parseFloat(user.balance).toLocaleString()}`;
    
    // VULNERABLE: Uses user ID directly from cookie without validation
    const userId = getCookie('user_id') || user.id;
    
    const txRes = await fetch(`/api/transactions/${userId}`);
    const transactions = await txRes.json();
    
    const tbody = document.getElementById('transactionBody');
    if (tbody) {
        tbody.innerHTML = transactions.slice(0, 10).map(tx => `
            <tr>
                <td>${tx.timestamp}</td>
                <td>${tx.from_user}</td>
                <td>${tx.to_user}</td>
                <td>$${parseFloat(tx.amount).toLocaleString()}</td>
                <td>${tx.description || ''}</td>
            </tr>
        `).join('');
    }
}

// Handle transfer form
async function handleTransfer(e) {
    e.preventDefault();
    
    const data = {
        toUser: document.getElementById('toUser').value,
        amount: document.getElementById('amount').value,
        description: document.getElementById('description').value
    };
    
    const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await res.json();
    showResult(result.success, result.message);
    
    if (result.success) {
        setTimeout(() => window.location.reload(), 1500);
    }
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('email').value,
        full_name: document.getElementById('fullName').value,
        address: document.getElementById('address').value,
        phone: document.getElementById('phone').value
    };
    
    const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await res.json();
    showResult(result.success, result.message);
}

// Handle mass assignment (vulnerable)
async function handleMassUpdate(e) {
    e.preventDefault();
    
    const rawData = document.getElementById('massUpdateData').value;
    let data;
    
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        showResult(false, 'Invalid JSON');
        return;
    }
    
    const res = await fetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await res.json();
    showResult(false, JSON.stringify(result, null, 2));
}

// Handle comment post (XSS vulnerable)
async function postComment() {
    const comment = document.getElementById('commentInput').value;
    
    const res = await fetch('/api/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    
    await res.json();
    document.getElementById('commentInput').value = '';
    loadComments();
}

// Load comments (XSS vulnerable - no sanitization)
async function loadComments() {
    const res = await fetch('/api/comments');
    const comments = await res.json();
    
    const container = document.getElementById('commentsList');
    if (container) {
        // VULNERABLE: innerHTML with unsanitized data = Stored XSS
        container.innerHTML = comments.map(c => `
            <div class="comment">
                <div class="username">${c.username}</div>
                <div class="text">${c.comment}</div>
                <div class="time">${c.timestamp}</div>
            </div>
        `).join('');
    }
}

// Handle ping (Command injection vulnerable)
async function handlePing() {
    const host = document.getElementById('pingHost').value;
    
    const res = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host })
    });
    
    const data = await res.json();
    document.getElementById('pingOutput').textContent = data.output || data.error || 'No output';
}

// Handle search
async function searchUsers() {
    const query = document.getElementById('searchInput').value;
    
    // VULNERABLE: Reflected XSS - displays search query directly
    document.getElementById('searchQuery').innerHTML = query;
    
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const users = await res.json();
    
    const container = document.getElementById('searchResults');
    if (container) {
        container.innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>${u.full_name}</td>
            </tr>
        `).join('');
    }
}

// Handle admin SQL query
async function executeAdminQuery() {
    const sql = document.getElementById('adminSql').value;
    
    const res = await fetch('/api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
    });
    
    const data = await res.json();
    document.getElementById('adminOutput').textContent = JSON.stringify(data, null, 2);
}

// Handle password reset (vulnerable)
async function resetPassword() {
    const username = document.getElementById('resetUsername').value;
    const answer = document.getElementById('resetAnswer').value;
    
    const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, secret_answer: answer })
    });
    
    const result = await res.json();
    
    if (result.success) {
        document.getElementById('resetResult').innerHTML = `Password: <strong>${result.password}</strong>`;
    } else {
        document.getElementById('resetResult').textContent = result.message;
    }
}

// Handle file read (path traversal)
async function readFile() {
    const filename = document.getElementById('fileName').value;
    const res = await fetch(`/api/file?name=${encodeURIComponent(filename)}`);
    const content = await res.text();
    document.getElementById('fileContent').textContent = content;
}

// Handle token generation
async function generateToken() {
    const userId = document.getElementById('tokenUserId').value || currentUser.id;
    const res = await fetch(`/api/generate-token?id=${userId}`);
    const data = await res.json();
    document.getElementById('generatedToken').textContent = data.token;
    
    // Decode and show the token contents
    const decoded = atob(data.token);
    document.getElementById('tokenDecoded').textContent = decoded;
}

// View any user by ID (IDOR)
async function viewUserById() {
    const userId = document.getElementById('viewUserId').value;
    const res = await fetch(`/api/user/${userId}`);
    const user = await res.json();
    document.getElementById('userViewOutput').textContent = JSON.stringify(user, null, 2);
}

// Handle session fixation
async function setSession() {
    const userId = document.getElementById('sessionUserId').value;
    const res = await fetch(`/api/set-session?id=${userId}`);
    const data = await res.json();
    
    if (data.success) {
        window.location.reload();
    }
}

// Handle race condition attack
async function raceConditionAttack() {
    const amount = document.getElementById('raceAmount').value || 100;
    const promises = [];
    
    for (let i = 0; i < 5; i++) {
        promises.push(
            fetch('/api/quick-transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toUser: document.getElementById('raceTarget').value || 'attacker',
                    amount: amount
                })
            })
        );
    }
    
    const results = await Promise.all(promises);
    const data = await Promise.all(results.map(r => r.json()));
    document.getElementById('raceOutput').textContent = JSON.stringify(data, null, 2);
}

// Handle blind SQL injection test
async function testBlindInjection() {
    const username = document.getElementById('blindSqlInput').value;
    const res = await fetch(`/api/user-exists?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    document.getElementById('blindSqlOutput').textContent = JSON.stringify(data, null, 2);
}

// Utility functions
function showResult(success, message) {
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.innerHTML = message;
        resultDiv.className = success ? 'result success' : 'result error';
        resultDiv.style.display = 'block';
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Auto-check auth on pages that need it
if (!window.location.pathname.includes('login.html') && window.location.pathname !== '/') {
    checkAuth();
}