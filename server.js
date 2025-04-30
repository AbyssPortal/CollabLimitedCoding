const http = require('http');
const fs = require('fs');
const path = require('path');
const RW = require('read-write-mutexify')
const { Server: SocketServer } = require("socket.io");
const express = require('express')
const { SHA256 } = require('./sha256');
const beautify = require('js-beautify/js').js



const app = express();



const PORT = 3000;




let tokens_lock = new RW()
tokens = ['']
let users = new Map()

const file_whitelist = ['index.html', 'styles.css', 'code.js', 'sha256.js', 'run.html'];


// TODO if i ever finish this **switch to https** **asap**
const server = http.createServer(handle_http_request);

app.get('/', (req, res) => {
    handle_http_request(req, res);
});


function handle_http_request(req, res) {
    if (req.method === 'GET') {
        let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
        const extname = path.extname(filePath);
        let contentType = 'text/plain';

        // Handle API paths
        if (req.url.startsWith('/api/')) {
            const apiPath = req.url.replace('/api/', '');
            if (apiPath === 'tokens') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                tokens_lock.read.lock();
                console.log('Sending:', JSON.stringify({ 'tokens': tokens }));
                res.end(JSON.stringify({ 'tokens': tokens, }));
                tokens_lock.read.unlock();
                return;
            }
            if (apiPath === 'code') {
                let code = tokens.join(' ');
                code = beautify(code, { indent_size: 4, space_in_empty_paren: false });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                tokens_lock.read.lock();
                res.end(JSON.stringify({ 'code': code, }));
                tokens_lock.read.unlock();
                return;
            }
        }
        // Set the content type based on the file extension
        switch (extname) {
            case '.html':
                contentType = 'text/html';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.js':
                contentType = 'application/javascript';
                break;
            case '.json':
                contentType = 'application/json';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.jpg':
                contentType = 'image/jpeg';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
        }
        if (!file_whitelist.includes(path.basename(filePath))) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File Not Found');
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            console.log('Received POST data:', body);
            try {
                throw 'not using post requests for this (yet????)'
                const changes = JSON.parse(body).changes;
                if (interpretChanges(changes)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                } else {
                    console.error('Error processing changes:', error);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid changes format or processing error' }));
                    return;
                }
            } catch (error) {
                console.error('Error processing changes:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid changes format or processing error' }));
                return;
            }
            res.end(JSON.stringify({ message: 'POST request received', data: body }));
            console.log('Tokens updated:', tokens);

        });
    }

    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
}


server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


const io = new SocketServer(server);

function fix_remaining_changes(user) {
    if (user.root === true) {
        user.remaining_changes = 1000000;
        user.next_refresh = Date.now() + 1000 * 60 * 60 * 24;
        return;
    }
    while (user.next_refresh < Date.now()) {
        user.remaining_changes++;
        user.next_refresh += 1000 * 60;
    }
    if (user.remaining_changes > 10) {
        user.remaining_changes = 10;
    }
}

io.on('connection', (socket) => {
    socket.socket_data = {};
    console.log('A user connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });

    socket.on('update_tokens', (data, callback) => {
        if (socket.socket_data.username == undefined) {
            callback({ success: false, message: 'You must be signed in to update tokens' });
            return;
        }
        user = users.get(socket.socket_data.username);
        fix_remaining_changes(user)
        tokens_lock.write.lock();
        console.log(JSON.stringify(tokens))
        const hash = SHA256(JSON.stringify(tokens));
        if (data.working_hash != hash) {
            console.log('Hash mismatch:', data.working_hash, hash);
            console.log(data)
            const message = `Hash mismatch detected. Your working hash: ${data.working_hash}, Server hash: ${hash}. Please refresh your data.`;
            callback({ success: false, message, remaining_changes: user.remaining_changes, next_refresh: user.next_refresh });
            tokens_lock.write.unlock();
            return;
        } else {
            if (interpretChange(data.change)) {
                user.remaining_changes--
                socket.broadcast.emit('update_tokens', { change: data.change });
            }
            else {
                const message = `Error processing change: ${JSON.stringify(data.change)}`;
                callback({ success: false, message, remaining_changes: user.remaining_changes, next_refresh: user.next_refresh });
                tokens_lock.write.unlock();
                return;
            }
        }
        tokens_lock.write.unlock();
        callback({ success: true, message: 'Tokens updated successfully', remaining_changes: user.remaining_changes, next_refresh: user.next_refresh });
        console.log('Tokens updated:', tokens);
    });






    //todo: make this have less than 8 bijillion vulnerabilities
    socket.on('register', (data, callback) => {
        if (users.has(data.username)) {
            socket.emit('register_response', { success: false, message: 'Username already taken' });
            callback({ success: false, message: 'Username already taken' });
        } else {
            salt = Math.floor(Math.random() * 1000000);
            users.set(data.username, {
                salt: salt,
                password_salt_hash: SHA256(data.password + salt),
                remaining_changes: 10,
                next_refresh: Date.now() + 1000 * 60
            });
            // console.log('registered:', data.username,{ salt: salt, password_salt_hash: SHA256(data.password + salt) });
            callback({
                success: true,
                message: 'Registration successful',
                remaining_changes: 10,
                next_refresh: Date.now() + 1000 * 60
            });
        }
        socket.socket_data.username = data.username;
    });
    socket.on('sign_in', (data, callback) => {
        if (!users.has(data.username)) {
            callback({ success: false, message: 'Username not in use' });
        } else {
            user_data = users.get(data.username);
            if (SHA256(data.password + user_data.salt) != user_data.password_salt_hash) {
                callback({ success: false, message: 'Incorrect password' });
                return;
            }
            fix_remaining_changes(user_data)
            callback({
                success: true,
                message: 'Sign in successful',
                remaining_changes: user_data.remaining_changes,
                next_refresh: user_data.next_refresh
            });
        }
        socket.socket_data.username = data.username;
    });

});


function interpretChange(change) {
    console.log(change)
    switch (change.type) {
        case 'create_element':
            if (change.where >= tokens.length || change.where < 0) {
                console.error('Invalid index:', change.where);
                return false;
            }
            tokens.splice(change.where + 1, 0, '');
            break;
        case 'edit_element':
            if (change.where >= tokens.length || change.where < 0) {
                console.error('Invalid index:', change.where);
                return false;
            }
            tokens[change.where] = change.to;
            break;
        case 'delete_element':
            if (tokens.length == 1) {
                console.error('Cannot delete the last element');
                return false;
            } else if (change.where >= tokens.length || change.where < 0) {
                console.error('Invalid index:', change.where);
                return false;
            }
            tokens.splice(change.where, 1);
            break;
        default:
            console.error('Unknown change type:', change.type);
            return false;
    }
    return true
}

function interpretChanges(changes_list) {
    tokens_lock.write.lock();
    if (changes_list.length > 10) {
        console.error('Too many changes:', changes_list.length);
        return false;
    }
    for (change of changes_list) {
        interpretChange(change)
    }
    tokens_lock.write.unlock();
    return true;
}

// Save users and tokens on process exit
process.on('exit', () => {
    saveData();
});

process.on('SIGINT', () => {
    saveData();
    process.exit();
});

process.on('SIGTERM', () => {
    saveData();
    process.exit();
});

function saveData() {
    try {
        tokens_lock.read.lock();
        fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens, null, 2));
        tokens_lock.read.unlock();
        fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(Array.from(users.entries()), null, 2));
        console.log('Data saved successfully.');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Load users and tokens on startup
try {
    if (fs.existsSync(path.join(__dirname, 'tokens.json'))) {
        tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
    }
    if (fs.existsSync(path.join(__dirname, 'users.json'))) {
        users = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'))));
    }
    console.log('Data loaded successfully.');
} catch (error) {
    console.error('Error loading data:', error);
}