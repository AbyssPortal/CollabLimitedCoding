const http = require('http');
const fs = require('fs');
const path = require('path');
const RW = require('read-write-mutexify')
const { Server: SocketServer } = require("socket.io");
const express = require('express')
const { SHA256 } = require('./sha256');
const beautify = require('js-beautify/js').js
const { is_token } = require('./is_token.js')




const user_file_location = '/data/users.json';
const token_file_location = '/data/tokens.json'
const refresh_config_file_location = '/data/refresh_config.json'





let tokens_lock = new RW()
tokens = ['']
refresh_config = {
    'refresh_rate': 1000 * 60,
    'max_tokens': 10
}
let users = new Map()

const file_whitelist = fs.readFileSync(path.join(__dirname, 'file_whitelist.txt'), 'utf-8').split('\n').map(line => line.trim()).filter(line => line.length > 0);

const PORT = 3000;
//TODO https
const server = http.createServer(handle_http_request);

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').split('.')[0];
}

console.log = ((log) => (...args) => {
    log(formatDate(Date.now()), ':', ...args);
})(console.log);

console.error = ((error) => (...args) => {
    error(formatDate(Date.now()), ':', ...args);
}
)(console.error);

function handle_http_request(req, res) {
    if (req.method === 'GET') {
        file_aliases = {
            '/': 'index.html',
            '/run': 'run.html',
        }
        const file_alias = file_aliases[req.url] ? file_aliases[req.url] : req.url;
        let filePath = path.join(__dirname, file_alias);
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
        const relativePath = path.relative(__dirname, filePath);
        if (!file_whitelist.includes(relativePath)) {
            console.log('Forbidden file:', relativePath);

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
        user.next_refresh += refresh_config.refresh_rate;
    }
    if (user.remaining_changes > refresh_config.max_tokens) {
        user.remaining_changes = refresh_config.max_tokens;
    }
}

io.on('connection', (socket) => {
    socket.socket_data = {};
    console.log('A user connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });

    socket.on('update_tokens', (data, callback) => {
        if (!check_signed_in_well()) {
            callback({ success: false, message: 'You must be signed in to update tokens' });
            return;
        }
        user = users.get(socket.socket_data.username);
        fix_remaining_changes(user)
        if (user.remaining_changes <= 0) {
            const message = `You have no remaining changes. Please wait until your next refresh.`;
            callback({ success: false, message, remaining_changes: user.remaining_changes, next_refresh: user.next_refresh });
            return;
        }
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
                socket.broadcast.emit('update_tokens', { change: data.change, old_hash: hash });
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

    socket.on('focus_token', (data) => {
        if (!check_signed_in_well()) {
            socket.emit('restart', { message: 'You must be signed in to use focus tokens' });
            return;
        }
        socket.broadcast.emit('focus_token', { where: data.where, username: users.get(socket.socket_data.username).username });
    })

    socket.on('focus_remove', (data) => {
        if (!check_signed_in_well()) {
            socket.emit('restart', { message: 'You must be signed in to use focus tokens' });
            return;
        }
        socket.broadcast.emit('focus_remove', { where: data.where, username: users.get(socket.socket_data.username).username });

    })





    //todo: make this have less than 8 bijillion vulnerabilities
    socket.on('register', (data, callback) => {
        if (data.username.length < 3) {
            callback({ success: false, message: 'Username must be at least 3 characters long' });
            return;
        }
        if (users.has(data.username.toLowerCase())) {
            callback({ success: false, message: 'Username already taken' });
        } else {
            salt = Math.floor(Math.random() * 1000000);
            users.set(data.username.toLowerCase(), {
                salt: salt,
                password_salt_hash: SHA256(data.password + salt),
                remaining_changes: 10,
                next_refresh: Date.now() + 1000 * 60,
                username: data.username,
                root: false
            }); // THE KEY IS LOWERCASE, THE USERNAME VALUE IS THE USER'S DESIRED CASE
            console.log('registered:', data.username, { salt: salt, password_salt_hash: SHA256(data.password + salt) });
            callback({
                success: true,
                message: 'Registration successful',
                remaining_changes: 10,
                next_refresh: Date.now() + 1000 * 60
            });
            socket.socket_data.username = data.username.toLowerCase();

        }
    });
    socket.on('sign_in', (data, callback) => {
        if (!users.has(data.username.toLowerCase())) {
            callback({ success: false, message: 'Username not in use' });
        } else {
            user_data = users.get(data.username.toLowerCase());
            if (SHA256(data.password + user_data.salt) != user_data.password_salt_hash) {
                callback({ success: false, message: 'Incorrect password' });
                return;
            }
            fix_remaining_changes(user_data)
            socket.socket_data.username = data.username.toLowerCase();

            callback({
                success: true,
                message: 'Sign in successful',
                remaining_changes: user_data.remaining_changes,
                next_refresh: user_data.next_refresh,
                root: user_data.root
            });
        }

    });

    socket.on('chat_message', (data) => {
        if (!check_signed_in_well()) {
            socket.emit('chat_message', { message: 'You must be signed in to send messages' });
            return;
        }
        console.log('Chat message from', socket.socket_data.username, ':', data.message);
        socket.broadcast.emit('chat_message', { message: `<${socket.socket_data.username}>:  ${data.message}` });
        socket.emit('chat_message', { message: `<${socket.socket_data.username}>:  ${data.message}` });
    });

    function check_signed_in_well() {
        if (socket.socket_data.username == undefined) {
            return false;
        }
        if (users.has(socket.socket_data.username) == false) {
            socket.send('restart', { message: 'You must be signed in to use this feature' });
            return false;
        }
        return true;
    }

    socket.on('root_command', (data) => {
        if (!check_signed_in_well()) {
            socket.emit('chat_message', { message: 'You must be signed in to use root features' });
            return;
        }
        if (!(users.get(socket.socket_data.username).root)) {
            socket.emit('chat_message', { message: 'You must be a root user to use this command' });
            return;
        }
        console.log('Root command from', socket.socket_data.username, ':', data.message);
        const words = data.message.split(' ');
        // one word commands




        if (words.length < 1) {
            socket.emit('chat_message', { message: 'Invalid command' });
            return;
        }

        //#region command functions
        function save(words) {
            saveData();
            socket.emit('chat_message', { message: 'Data saved successfully' });
        }
        function list_users(words) {
            let user_list = 'Users: ';
            for (const [key, value] of users.entries()) {
                user_list += `${key} (${value.root ? 'root' : 'user'}) `;
            }
            socket.emit('chat_message', { message: user_list });
        }
        function add_root(words) {
            if (users.has(words[1])) {
                users.get(words[1]).root = true;
                socket.emit('chat_message', { message: `User ${words[1]} is now a root user` });
                socket.broadcast.emit('chat_message', { message: `User ${words[1]} is now a root user` });
            } else {
                socket.emit('chat_message', { message: `User ${words[1]} not found` });
            }
        }
        function remove_root(words) {
            if (users.has(words[1])) {
                users.get(words[1]).root = false;
                socket.emit('chat_message', { message: `User ${words[1]} is no longer a root user` });
                socket.broadcast.emit('chat_message', { message: `User ${words[1]} is no longer a root user` });
            } else {
                socket.emit('chat_message', { message: `User ${words[1]} not found` });
            }
        }
        function kill_user(words) {
            if (users.has(words[1])) {
                socket.emit('chat_message', { message: `User ${words[1]} has been killed` });
                users.delete(words[1]);
            } else {
                socket.emit('chat_message', { message: `User ${words[1]} not found` });
            }
        }
        function set_refresh_rate(words) {
            {
                if (isNaN(words[1])) {
                    socket.emit('chat_message', { message: `Invalid refresh rate` });
                    return;
                }
                refresh_config.refresh_rate = parseInt(words[1]);
                refresh_config.refresh_rate = Math.max(refresh_config.refresh_rate, 1000);
                const response_message = `Refresh rate set to ${refresh_config.refresh_rate} ms. You may need to refresh`;
                socket.emit('chat_message', { message: response_message });
                socket.broadcast.emit('chat_message', { message: `Refresh rate set to ${refresh_config.refresh_rate} ms. You may need to refresh` });
            }
        }
        function set_max_tokens(words) {
            if (isNaN(words[1])) {
                socket.emit('chat_message', { message: `Invalid max tokens` });
                return;
            }
            refresh_config.max_tokens = parseInt(words[1]);
            refresh_config.max_tokens = Math.max(refresh_config.max_tokens, 1);
            const response_message = `Max stored changes set to ${refresh_config.max_tokens}. You may need to refresh`;
            socket.emit('chat_message', { message: response_message });
            socket.broadcast.emit('chat_message', { message: response_message });
        }
        function help(words) {
            let help_message = 'Available commands: ';
            for (const [key, value] of Object.entries(commands)) {
                help_message += `${value.name} (${value.description}) =-=-=-=-=-=-  `;
            }
            socket.emit('chat_message', { message: help_message });
        }
        //#endregion command functions

        const commands =
        {
            save: { name: 'save', min_args: 1, func: save, description: 'Save the current state. usage: save' },
            list_users: { name: 'list_users', min_args: 1, func: list_users, description: 'List all users. usage: list_users' },
            add_root: { name: 'add_root', min_args: 2, func: add_root, description: 'Add a user as a root user. usage: add_root <username>' },
            remove_root: { name: 'remove_root', min_args: 2, func: remove_root, description: 'Remove a user as a root user. usage: remove_root <username>' },
            kill_user: { name: 'kill_user', min_args: 2, func: kill_user, description: 'Remove a user. usage: kill_user <username>' },
            set_refresh_rate: { name: 'set_refresh_rate', min_args: 2, func: set_refresh_rate, description: 'Set the refresh rate. usage: set_refresh_rate <rate>' },
            set_max_tokens: { name: 'set_max_tokens', min_args: 2, func: set_max_tokens, description: 'Set the max tokens. usage: set_max_tokens <max_tokens>' },
            help: { name: 'help', min_args: 1, func: help, description: 'Show this message. usage: help' },
        }
        if (commands[words[0]] == undefined) {
            socket.emit('chat_message', { message: 'Invalid command' });
            return;
        }
        else {
            if (words.length < commands[words[0]].min_args) {
                socket.emit('chat_message', { message: `Invalid usage. usage: ${commands[words[0]].description}` });
                return;
            }
            commands[words[0]].func(words);
        }
    })

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
            if (!is_token(change.to)) {
                console.error('Invalid token:', change.to);
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


setInterval(() => {
    saveData();
    console.log('Auto-saving data...');
}, interval = 1000 * 60 * 15);
// Save users and tokens on process exit
process.on('exit', () => {
    console.log('Process exiting...');
    saveData();
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Exiting...');
    saveData();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Exiting...');

    saveData();
    process.exit();
});

function saveData() {
    try {
        tokens_lock.read.lock();
        fs.writeFileSync(token_file_location, JSON.stringify(tokens, null, 2));
        tokens_lock.read.unlock();
        fs.writeFileSync(user_file_location, JSON.stringify(Array.from(users.entries()), null, 2));
        fs.writeFileSync(refresh_config_file_location, JSON.stringify(refresh_config, null, 2));
        console.log('Data saved successfully.');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Load users and tokens on startup
try {
    console.log('Loading data...');
    if (fs.existsSync(token_file_location)) {
        tokens_lock.write.lock();
        tokens = JSON.parse(fs.readFileSync(token_file_location));
        tokens_lock.write.unlock();
    } else {
        console.log('No token file found.');
    }
    if (fs.existsSync(user_file_location)) {
        users = new Map(JSON.parse(fs.readFileSync(user_file_location)));
    }
    else {
        console.log('No user file found.');
    }
    if (fs.existsSync(refresh_config_file_location)) {
        refresh_config = JSON.parse(fs.readFileSync(refresh_config_file_location));
    }
    else {
        console.log('No refresh config file found.');
    }
    console.log('Data loaded successfully.');
} catch (error) {
    console.error('Error loading data:', error);
}