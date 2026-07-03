const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const initSqlJs = require('sql.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

let db;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  try {
    const fileBuffer = fs.readFileSync('bank.db');
    db = new SQL.Database(fileBuffer);
  } catch {
    db = new SQL.Database();
  }
  
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email TEXT, full_name TEXT, balance REAL DEFAULT 1000.00, role TEXT DEFAULT 'user', ssn TEXT, dob TEXT, address TEXT, phone TEXT, credit_card TEXT, secret_question TEXT, secret_answer TEXT, api_key TEXT, notes TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT, to_user TEXT, amount REAL, description TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, user TEXT, ip TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, comment TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS credit_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, card_number TEXT, expiry TEXT, cvv TEXT, cardholder TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS internal_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, access_level TEXT)`);

  const result = db.exec('SELECT COUNT(*) as count FROM users');
  const count = result[0]?.values[0]?.[0] || 0;
  
  if (count === 0) {
    const users = [
      ['admin', 'admin123', 'admin@vulnbank.com', 'System Administrator', 999999.00, 'admin', '123-45-6789', '1985-01-15', '4532-XXXX-XXXX-7890', 'Pet name?', 'fluffy', 'vulnbank_api_key_admin_2024', 'Server SSH: admin@192.168.1.100 password: P@ssw0rd! Vault code: 7391'],
      ['john_doe', 'password1', 'john@email.com', 'John Doe', 5000.00, 'user', '987-65-4321', '1990-06-20', '5412-XXXX-XXXX-3456', 'Mothers maiden name?', 'smith', '', ''],
      ['jane_smith', 'password2', 'jane@email.com', 'Jane Smith', 25000.00, 'user', '456-78-9123', '1988-03-10', '3782-XXXX-XXXX-1234', 'City born in?', 'chicago', '', 'Backup codes: 8834-9921-7734'],
      ['bob_wilson', 'password3', 'bob@email.com', 'Bob Wilson', 150.00, 'user', '789-12-3456', '1995-11-30', '6011-XXXX-XXXX-5678', 'Favorite color?', 'blue', '', ''],
      ['alice_brown', 'password4', 'alice@email.com', 'Alice Brown', 75000.00, 'user', '321-54-9876', '1992-07-25', '3400-XXXX-XXXX-9012', 'First car?', 'honda', '', 'Safe combination: 47-23-89'],
      ['service_account', 'S3rv1ce!@#', 'service@vulnbank.internal', 'Service Account', 0.00, 'service', null, null, null, null, null, '', 'CRITICAL: DB backup exposed at /backup/bank_backup.db. Internal API at /api/internal. Admin credentials: admin/admin123'],
      ['dev_test', 'devtest123', 'dev@vulnbank.internal', 'Developer Test', 100000.00, 'dev', null, null, null, null, null, '', 'TODO: Remove before production. JWT secret: vulnbank_jwt_secret_2024. Debug endpoint at /api/debug']
    ];
    
    const stmt = db.prepare('INSERT INTO users (username, password, email, full_name, balance, role, ssn, dob, credit_card, secret_question, secret_answer, api_key, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const user of users) {
      stmt.run(user);
    }
    stmt.free();

    const cards = [
      [1, '4532789012345678', '12/2027', '789', 'Admin User'],
      [2, '5412345678903456', '06/2026', '456', 'John Doe'],
      [3, '3782456789012345', '03/2028', '123', 'Jane Smith'],
    ];
    const cardStmt = db.prepare('INSERT INTO credit_cards (user_id, card_number, expiry, cvv, cardholder) VALUES (?, ?, ?, ?, ?)');
    for (const card of cards) {
      cardStmt.run(card);
    }
    cardStmt.free();
  }

  const notesResult = db.exec('SELECT COUNT(*) as count FROM internal_notes');
  const notesCount = notesResult[0]?.values[0]?.[0] || 0;
  
  if (notesCount === 0) {
    const notes = [
      ['Database Backup Location', 'Full database backup available at /backup/bank_backup.db - no authentication required', 'public'],
      ['Admin Credentials', 'Default admin login: username=admin, password=admin123', 'public'],
      ['SSH Access', 'Production server SSH: 192.168.1.100:22 - username: admin, password: P@ssw0rd!', 'admin'],
      ['JWT Secret', 'The JWT signing secret is: vulnbank_jwt_secret_2024 - stored in dev_test user notes', 'admin'],
      ['Internal API', 'Internal API accessible at /api/internal without authentication - contains user data', 'admin'],
      ['Debug Endpoint', 'Debug endpoint at /api/debug exposes server info including file paths', 'public'],
      ['Service Account', 'Service account credentials: service_account / S3rv1ce!@# - has access to all user data', 'admin'],
      ['Credit Card Data', 'Full credit card numbers stored in credit_cards table - accessible via IDOR at /api/user/:id', 'admin'],
      ['Password Reset Vulnerability', 'Password reset at /api/reset-password returns plaintext password and is vulnerable to SQL injection', 'public'],
      ['Command Injection', 'The ping endpoint at /api/ping executes system commands without sanitization - try: 8.8.8.8; dir', 'public'],
      ['Database Export', 'Full database export available at /api/export-data - returns all user data including passwords in JSON or CSV', 'public'],
      ['Config File', 'Configuration exposed at /api/config - contains session secret and JWT secret', 'public'],
    ];
    
    const noteStmt = db.prepare('INSERT INTO internal_notes (title, content, access_level) VALUES (?, ?, ?)');
    for (const note of notes) {
      noteStmt.run(note);
    }
    noteStmt.free();
  }
  
  saveDatabase();
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('bank.db', buffer);
}

function queryAll(sql) {
  try {
    const results = db.exec(sql);
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col.toLowerCase()] = row[i]);
      return obj;
    });
  } catch (e) {
    throw e;
  }
}

function queryOne(sql) {
  const results = queryAll(sql);
  return results.length > 0 ? results[0] : null;
}

function runQuery(sql) {
  db.run(sql);
  saveDatabase();
}

function requireAuthForPage(req, res, next) {
  const publicPages = ['/', '/login', '/register', '/support', '/learn'];
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/backup/')) return next();
  if (publicPages.includes(req.path)) return next();
  if (req.path.match(/\.(css|js|png|jpg|ico|svg|txt)$/)) return next();
  if (!req.session.userId) return res.redirect('/login');
  next();
}

initDatabase().then(() => {
  
  app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.text({ type: 'application/xml', limit: '50mb' }));
  app.use(cookieParser());
  app.use(session({
    secret: 'session_secret_key_123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: false }
  }));

  app.use(express.static('public'));
  app.use(requireAuthForPage);

  // Account Registration
  app.post('/api/register', (req, res) => {
    const { username, password, email, full_name, secret_question, secret_answer } = req.body;
    
    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password are required' });
    }
    
    if (username.length < 3) {
      return res.json({ success: false, message: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const existingUser = queryOne(`SELECT id FROM users WHERE username = '${username}'`);
    if (existingUser) {
      return res.json({ success: false, message: 'Username already taken' });
    }
    
    try {
      runQuery(`INSERT INTO users (username, password, email, full_name, balance, role, secret_question, secret_answer) VALUES ('${username}', '${password}', '${email || ''}', '${full_name || ''}', 1000.00, 'user', '${secret_question || ''}', '${secret_answer || ''}')`);
      
      const newUser = queryOne(`SELECT id, username, email, full_name, balance, role FROM users WHERE username = '${username}'`);
      
      req.session.userId = newUser.id;
      req.session.username = newUser.username;
      req.session.role = newUser.role;
      
      res.cookie('user_id', newUser.id.toString(), { httpOnly: false });
      res.cookie('username', newUser.username, { httpOnly: false });
      res.cookie('role', newUser.role, { httpOnly: false });
      
      res.json({ success: true, message: 'Account created successfully', user: newUser });
    } catch (e) {
      res.json({ success: false, message: 'Registration failed' });
    }
  });

  // SQL Injection in Login
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    try {
      const user = queryOne(query);
      if (user) {
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        runQuery(`INSERT INTO admin_logs (action, user, ip) VALUES ('login', '${user.username}', '${req.ip}')`);
        res.cookie('user_id', user.id.toString(), { httpOnly: false });
        res.cookie('username', user.username, { httpOnly: false });
        res.cookie('role', user.role, { httpOnly: false });
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, balance: user.balance } });
      } else {
        res.json({ success: false, message: 'Invalid username or password' });
      }
    } catch (e) {
      res.json({ success: false, message: 'An error occurred during login' });
    }
  });

  // NoSQL Injection
  app.post('/api/nosql-login', (req, res) => {
    const { username, password } = req.body;
    try {
      const parsedUser = JSON.parse(username);
      if (parsedUser.$ne || parsedUser.$gt || parsedUser.$regex) {
        const users = queryAll("SELECT * FROM users WHERE username != ''");
        return res.json({ success: true, message: 'Authentication bypassed', users: users });
      }
    } catch (e) {}
    const user = queryOne(`SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`);
    if (user) { res.json({ success: true, user: user }); }
    else { res.json({ success: false, message: 'Invalid credentials' }); }
  });

  // IDOR - View any user with credit card data
  app.get('/api/user/:id', (req, res) => {
    const user = queryOne(`SELECT u.*, c.card_number, c.expiry, c.cvv, c.cardholder FROM users u LEFT JOIN credit_cards c ON u.id = c.user_id WHERE u.id = ${req.params.id}`);
    if (user) { res.json(user); }
    else { res.json({ error: 'User not found' }); }
  });

  // SQL Injection in Search
  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';
    try {
      const results = queryAll(`SELECT id, username, email, full_name, role FROM users WHERE username LIKE '%${q}%' OR full_name LIKE '%${q}%' OR email LIKE '%${q}%'`);
      res.json(results);
    } catch (e) { res.json({ error: 'Search failed' }); }
  });

  // Transfer with validation
  app.post('/api/transfer', (req, res) => {
    if (!req.session.username) return res.json({ success: false, message: 'You must be logged in to transfer money' });
    
    const { toUser, amount, description } = req.body;
    const transferAmount = parseFloat(amount);
    
    if (!toUser || !amount) {
      return res.json({ success: false, message: 'Recipient and amount are required' });
    }
    
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.json({ success: false, message: 'Please enter a valid amount' });
    }
    
    if (toUser === req.session.username) {
      return res.json({ success: false, message: 'You cannot send money to yourself' });
    }
    
    const recipient = queryOne(`SELECT username FROM users WHERE username = '${toUser}'`);
    if (!recipient) {
      return res.json({ success: false, message: `Recipient '${toUser}' does not exist` });
    }
    
    const sender = queryOne(`SELECT balance FROM users WHERE username = '${req.session.username}'`);
    if (!sender || sender.balance < transferAmount) {
      return res.json({ success: false, message: 'Insufficient funds' });
    }
    
    try {
      runQuery(`UPDATE users SET balance = balance - ${transferAmount} WHERE username = '${req.session.username}'`);
      runQuery(`UPDATE users SET balance = balance + ${transferAmount} WHERE username = '${toUser}'`);
      runQuery(`INSERT INTO transactions (from_user, to_user, amount, description) VALUES ('${req.session.username}', '${toUser}', ${transferAmount}, '${description || ''}')`);
      
      const updatedSender = queryOne(`SELECT balance FROM users WHERE username = '${req.session.username}'`);
      
      res.json({ 
        success: true, 
        message: `Successfully sent $${transferAmount.toLocaleString()} to ${toUser}`,
        newBalance: updatedSender.balance,
        transaction: { from: req.session.username, to: toUser, amount: transferAmount, description: description || '' }
      });
    } catch (e) { 
      res.json({ success: false, message: 'Transfer failed. Please try again.' }); 
    }
  });

  // Command Injection
  app.post('/api/ping', (req, res) => {
    const host = req.body.host || '8.8.8.8';
    exec(`ping -c 4 ${host} 2>&1`, { timeout: 10000 }, (error, stdout, stderr) => {
      res.json({ output: stdout || stderr || error?.message || 'Command executed' });
    });
  });

  // Stored XSS in Comments
  app.post('/api/comment', (req, res) => {
    const comment = req.body.comment || '';
    const username = req.session.username || 'anonymous';
    const userId = req.session.userId || 0;
    runQuery(`INSERT INTO comments (user_id, username, comment) VALUES (${userId}, '${username}', '${comment}')`);
    res.json({ success: true });
  });

  app.get('/api/comments', (req, res) => {
    res.json(queryAll('SELECT * FROM comments ORDER BY timestamp DESC LIMIT 50'));
  });

  // Reflected XSS
  app.get('/api/error', (req, res) => {
    const msg = req.query.msg || 'An error occurred';
    res.send(`<html><head><title>Error</title></head><body style="font-family:sans-serif;padding:40px;"><h1>Error</h1><p>${msg}</p><a href="/">Go back</a></body></html>`);
  });

  // CSRF (No token)
  app.post('/api/update-profile', (req, res) => {
    if (!req.session.userId) return res.json({ success: false, message: 'Not logged in' });
    const { email, full_name, address, phone } = req.body;
    runQuery(`UPDATE users SET email = '${email}', full_name = '${full_name}', address = '${address}', phone = '${phone}' WHERE id = ${req.session.userId}`);
    res.json({ success: true, message: 'Profile updated' });
  });

  // IDOR in Transactions
  app.get('/api/transactions/:userId', (req, res) => {
    const user = queryOne(`SELECT username FROM users WHERE id = ${req.params.userId}`);
    if (user) {
      res.json(queryAll(`SELECT * FROM transactions WHERE from_user = '${user.username}' OR to_user = '${user.username}' ORDER BY timestamp DESC`));
    } else { res.json([]); }
  });

  // Weak Password Reset
  app.post('/api/reset-password', (req, res) => {
    const { username, secret_answer } = req.body;
    const user = queryOne(`SELECT * FROM users WHERE username = '${username}' AND secret_answer = '${secret_answer}'`);
    if (user) { res.json({ success: true, password: user.password, email: user.email }); }
    else { res.json({ success: false, message: 'Invalid username or security answer' }); }
  });

  // Path Traversal
  app.get('/api/file', (req, res) => {
    const fileName = req.query.name || 'welcome.txt';
    const filePath = path.join(__dirname, 'public', 'files', fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.type('text/plain').send(content);
    } catch (e) { res.status(404).send('File not found: ' + fileName); }
  });

  // Mass Assignment
  app.post('/api/update-user', (req, res) => {
    if (!req.session.userId) return res.json({ success: false, message: 'Not logged in' });
    let clauses = [];
    for (let [k, v] of Object.entries(req.body)) {
      if (k !== 'id') clauses.push(`${k} = '${v}'`);
    }
    if (clauses.length > 0) {
      runQuery(`UPDATE users SET ${clauses.join(', ')} WHERE id = ${req.session.userId}`);
      res.json({ success: true, message: 'User updated' });
    }
  });

  // Open Redirect
  app.get('/redirect', (req, res) => {
    res.redirect(req.query.url || '/dashboard');
  });

  // Session Fixation
  app.get('/api/set-session', (req, res) => {
    const id = req.query.id;
    if (id) {
      req.session.userId = parseInt(id);
      const user = queryOne(`SELECT * FROM users WHERE id = ${id}`);
      if (user) {
        req.session.username = user.username;
        req.session.role = user.role;
      }
      res.json({ success: true, message: 'Session updated' });
    }
  });

  // Info Leakage Headers
  app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'VulnBank/1.0.0');
    res.setHeader('Server', 'VulnBank-Internal/1.0');
    res.setHeader('X-Debug-Route', req.path);
    res.setHeader('X-Internal-IP', '192.168.1.100');
    res.setHeader('X-DB-Path', path.join(__dirname, 'bank.db'));
    next();
  });

  // Weak Token Generation
  app.get('/api/generate-token', (req, res) => {
    const userId = req.query.id || req.session.userId || 1;
    const payload = `user=${userId}&role=admin&exp=${Math.floor(Date.now()/1000)+999999}`;
    const token = Buffer.from(payload).toString('base64');
    const signature = crypto.createHmac('sha256', 'vulnbank_jwt_secret_2024').update(token).digest('hex').substring(0, 32);
    res.json({ token: token, signature: signature, full_token: `${token}.${signature}` });
  });

  // Race Condition
  app.post('/api/quick-transfer', (req, res) => {
    if (!req.session.username) return res.json({ success: false, message: 'Not logged in' });
    const { toUser, amount } = req.body;
    const recipient = queryOne(`SELECT username FROM users WHERE username = '${toUser}'`);
    if (!recipient) return res.json({ success: false, message: 'Recipient does not exist' });
    const user = queryOne(`SELECT balance FROM users WHERE username = '${req.session.username}'`);
    setTimeout(() => {
      if (user && user.balance >= parseFloat(amount)) {
        runQuery(`UPDATE users SET balance = balance - ${amount} WHERE username = '${req.session.username}'`);
        runQuery(`UPDATE users SET balance = balance + ${amount} WHERE username = '${toUser}'`);
        res.json({ success: true, message: 'Transfer complete' });
      } else { res.json({ success: false, message: 'Insufficient funds' }); }
    }, 100);
  });

  // Blind SQL Injection
  app.get('/api/user-exists', (req, res) => {
    const username = req.query.username || '';
    try {
      const result = queryOne(`SELECT COUNT(*) as count FROM users WHERE username = '${username}'`);
      res.json({ exists: !!(result && result.count > 0) });
    } catch (e) { res.json({ exists: false }); }
  });

  // Database backup
  app.get('/backup/bank_backup.db', (req, res) => {
    try {
      const dbPath = path.join(__dirname, 'bank.db');
      if (fs.existsSync(dbPath)) {
        res.download(dbPath, 'bank_backup.db');
      } else {
        res.status(404).send('Backup file not found');
      }
    } catch (e) { res.status(500).send('Error downloading backup'); }
  });

  // Debug endpoint
  app.get('/api/debug', (req, res) => {
    res.json({
      server: 'VulnBank',
      version: '1.0.0',
      node: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      db_path: path.join(__dirname, 'bank.db'),
      internal_ssh: 'admin@192.168.1.100 password: P@ssw0rd!',
      jwt_secret: 'vulnbank_jwt_secret_2024',
      admin_credentials: 'admin / admin123',
      service_account: 'service_account / S3rv1ce!@#'
    });
  });

  // User enumeration via timing
  app.post('/api/verify-user', (req, res) => {
    const start = Date.now();
    const user = queryOne(`SELECT * FROM users WHERE username = '${req.body.username}'`);
    const delay = user ? 100 : 500;
    setTimeout(() => {
      res.json({ valid: !!user, response_time_ms: Date.now() - start });
    }, delay);
  });

  // Exposed config
  app.get('/api/config', (req, res) => {
    res.json({
      app_name: 'VulnBank',
      version: '1.0.0',
      environment: 'production',
      database: { type: 'sqlite', path: './bank.db', backup_url: '/backup/bank_backup.db' },
      session: { secret: 'session_secret_key_123', maxAge: 86400000 },
      jwt_secret: 'vulnbank_jwt_secret_2024',
      admin_credentials: { username: 'admin', password: 'admin123' },
      internal_api: '/api/internal',
      debug_endpoint: '/api/debug'
    });
  });

  // Internal notes
  app.get('/api/internal-notes', (req, res) => {
    res.json(queryAll('SELECT * FROM internal_notes'));
  });

  // SSRF Proxy
  app.post('/api/ssrf-proxy', (req, res) => {
    const url = req.body.url || '';
    if (!url) return res.json({ error: 'No URL provided' });
    try {
      const protocol = url.startsWith('https') ? require('https') : require('http');
      protocol.get(url, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => res.json({ status: response.statusCode, data: data.substring(0, 5000) }));
      }).on('error', (e) => res.json({ error: e.message }));
    } catch (e) {
      exec(`curl -s "${url}" 2>&1 | head -100`, { timeout: 5000 }, (err, stdout) => {
        res.json({ output: stdout || err?.message || 'Request failed' });
      });
    }
  });

  // XXE Injection
  app.post('/api/xxe-parse', (req, res) => {
    const xmlData = req.body;
    if (typeof xmlData === 'string' && xmlData.includes('<?xml')) {
      try {
        const doctypeMatch = xmlData.match(/<!ENTITY\s+(\w+)\s+SYSTEM\s+"([^"]+)"/);
        if (doctypeMatch) {
          const entityName = doctypeMatch[1];
          const filePath = doctypeMatch[2];
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8').substring(0, 1000);
            return res.json({ parsed: true, entity: entityName, content: fileContent });
          } catch (e) {
            return res.json({ parsed: true, entity: entityName, error: 'File not found' });
          }
        }
        return res.json({ parsed: true, data: xmlData.substring(0, 500) });
      } catch (e) {
        return res.json({ error: 'XML parse error' });
      }
    }
    res.json({ error: 'Send XML data in request body' });
  });

  // GraphQL endpoint
  app.post('/api/graphql', (req, res) => {
    const { query } = req.body;
    if (query && query.includes('__schema')) {
      return res.json({
        data: {
          __schema: {
            types: [
              { name: 'User', fields: [{ name: 'id' }, { name: 'username' }, { name: 'password' }, { name: 'email' }, { name: 'ssn' }, { name: 'credit_card' }, { name: 'balance' }, { name: 'role' }] },
              { name: 'Transaction', fields: [{ name: 'id' }, { name: 'from_user' }, { name: 'to_user' }, { name: 'amount' }] },
              { name: 'InternalNote', fields: [{ name: 'title' }, { name: 'content' }, { name: 'access_level' }] }
            ]
          }
        }
      });
    }
    res.json({ data: { message: 'GraphQL endpoint active. Try introspection query.' } });
  });

  // Internal API
  app.get('/api/internal', (req, res) => {
    res.json({
      status: 'healthy',
      users: queryAll('SELECT id, username, email, password, role, ssn, credit_card, notes FROM users'),
      transactions: queryOne('SELECT COUNT(*) as count FROM transactions')?.count || 0,
      internal_notes: queryAll('SELECT * FROM internal_notes'),
      ssh_credentials: 'admin@192.168.1.100 password: P@ssw0rd!',
      jwt_secret: 'vulnbank_jwt_secret_2024'
    });
  });

  // Export data
  app.get('/api/export-data', (req, res) => {
    const format = req.query.format || 'json';
    if (format === 'csv') {
      const users = queryAll('SELECT * FROM users');
      let csv = 'id,username,password,email,full_name,balance,role,ssn,credit_card,notes\n';
      users.forEach(u => csv += `${u.id},${u.username},${u.password},${u.email},${u.full_name},${u.balance},${u.role},${u.ssn},${u.credit_card},"${u.notes||''}"\n`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    } else {
      res.json(queryAll('SELECT * FROM users'));
    }
  });

  app.get('/api/me', (req, res) => {
    if (req.session.userId) {
      const user = queryOne(`SELECT * FROM users WHERE id = ${req.session.userId}`);
      if (user) { res.json(user); }
      else { res.json({ error: 'User not found' }); }
    } else { res.json({ error: 'Not logged in' }); }
  });

  app.get('/api/balance', (req, res) => {
    if (req.session.userId) {
      const user = queryOne(`SELECT balance FROM users WHERE id = ${req.session.userId}`);
      res.json({ balance: user?.balance || 0 });
    } else { res.json({ balance: 0 }); }
  });

  app.get('/api/admin/users', (req, res) => {
    res.json(queryAll('SELECT id, username, email, full_name, balance, role FROM users'));
  });

  app.post('/api/admin/query', (req, res) => {
    try {
      if (req.body.sql.toLowerCase().includes('select')) {
        res.json({ results: queryAll(req.body.sql) });
      } else {
        runQuery(req.body.sql);
        res.json({ success: true, message: 'Query executed' });
      }
    } catch (e) { res.json({ error: e.message }); }
  });

  // Page routes
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
  app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
  app.get('/learn', (req, res) => res.sendFile(path.join(__dirname, 'public', 'learn.html')));
  app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
  app.get('/transfer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'transfer.html')));
  app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
  app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));
  app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));

  app.listen(PORT, () => {
    console.log('');
    console.log('  VulnBank running on http://localhost:' + PORT);
    console.log('  30+ vulnerabilities ready for testing');
    console.log('');
  });

}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});