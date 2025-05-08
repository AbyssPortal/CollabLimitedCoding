

changes_list = [];
token_increment = 0;


socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    alert('Disconnected from server. Refreshing the page...');
    location.reload();
});

const tokensHome = document.getElementById('tokens_home');


refresh_config = {
    'refresh_rate': 1000 * 60,
    'max_tokens': 10
}

fetch('/refresh_config.json').then(response => response.json()).then(data => {

    refresh_config = data;

}).catch(error => {
    console.error('Error fetching refresh config:', error);
    alert('Error fetching refresh config. Please try again later.');
})

socket.on('update_tokens', (data) => {
    console.log('Received update_tokens:', data);
    console.log('Current tokens:', getAllTokens());
    if (data.old_hash != SHA256(JSON.stringify(getAllTokens()))) {
        console.log('Hash mismatch:', data.old_hash, SHA256(JSON.stringify(getAllTokens())));
        fetchAndDisplayTokens();
        return;
    }
    if (data.change) {
        interpretChange(data.change);
    }
})

socket.on('chat_message', (data) => {
    const chatMessages = document.getElementById('chat_messages');
    const newMessage = document.createElement('div');
    newMessage.textContent = data.message;
    newMessage.className = 'chat-message';
    chatMessages.appendChild(newMessage);
    while (chatMessages.childElementCount > 20) {
        chatMessages.removeChild(chatMessages.childNodes[0]);
    }
});



document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayTokens();




});




function fetchAndDisplayTokens() {
    while (tokensHome.firstChild) {
        tokensHome.removeChild(tokensHome.firstChild);
    }
    fetch('/api/tokens')
        .then(response => response.json())
        .then(data => {
            console.log('recieved:', data);
            tokens = data.tokens;
            if (tokensHome) {
                if (tokens.length == 0) {
                    const tokenTextbox = createTokenTextbox();
                    tokensHome.appendChild(tokenTextbox);
                    fix_textbox_width(tokenTextbox.firstChild);

                }
                else {
                    tokens.forEach(token => {
                        const tokenTextbox = createTokenTextbox(token);
                        tokensHome.appendChild(tokenTextbox);
                        fix_textbox_width(tokenTextbox.firstChild);

                    });
                }
            }
        })
        .catch(error => {
            console.error('Error fetching tokens:', error);
            tokens = [];
        });
}



function try_use_change() {

    if (remaining_changes > 0) {
        remaining_changes--;
        fix_remaining_changes_label();
        return true;
    } else {
        alert('No more changes left');
        return false;
    }
}

function fix_textbox_width(textbox) {
    if (!textbox.parentElement) {
        return;
    }
    if (textbox.parentElement.nextSibling && textbox.parentElement.nextSibling.tagName === 'BR') {
        textbox.parentElement.nextSibling.remove();
    }
    const text = textbox.value;
    const placeholder = textbox.placeholder;
    if (text == '') {
        textbox.style.width = `${placeholder.length}ch`;
        return;
    }
    textbox.style.width = `${text.length}ch`;
    if (text.endsWith(';') || text.endsWith('{') || text.endsWith('}')) {
        const br = document.createElement('br');
        textbox.parentElement.after(br);
    } else {
        textbox.style.width = `${text.length}ch`;

    }
}

function count_location(container) {

    return Array.from(container.parentNode.children).filter(element => element.className == 'token-container').indexOf(container);
}

function createTokenTextbox(text = '', id = undefined) {
    const textbox = document.createElement('input');
    textbox.type = 'text';
    textbox.className = 'squircle-textbox'
    textbox.dataset.old_value = text;
    if (text != '') {
        textbox.value = text;

    }
    else {
        textbox.placeholder = 'Token ' + ((id === undefined) ? (token_increment) : id);

        textbox.style.width = `${textbox.placeholder.length}ch`;

    }


    const button = document.createElement('button');
    button.className = 'plus-button';
    button.style.display = 'none';
    button.textContent = '+';


    const bubble = document.createElement('label');
    bubble.className = 'speech-bubble';
    bubble.textContent = 'foo';
    bubble.style.display = 'none'; // Initially hidden

    const container = document.createElement('span');
    container.className = 'token-container';
    container.appendChild(textbox);
    container.appendChild(button);
    container.appendChild(bubble);

    if (id == undefined) {
        container.id = 'token_container_' + token_increment;
        token_increment++;

    } else {
        container.id = 'token_container_' + id;
    }


    container.addEventListener('mouseover', () => {
        button.style.display = 'inline-block';
    });

    textbox.addEventListener('focus', () => {
        textbox.dataset.old_value = textbox.value;
        const count = count_location(container);
        socket.emit('focus_token', { where: count });

    });

    textbox.addEventListener('input', () => {
        fix_textbox_width(textbox);
        if (textbox.value == "DELETE") {

            textbox.value = textbox.dataset.old_value;
            fix_textbox_width(textbox);
            if (!try_use_change()) {
                return;
            }
            const count = count_location(container);
            console.log('Elements before this one:', count);
            send_tokens_change({ type: 'delete_element', where: count }).then((res) => {
                if (res == true) {
                    container.remove();
                }
            })


            return;
        }
    });

    textbox.addEventListener('blur', () => {
        textbox.value = textbox.dataset.old_value;
        fix_textbox_width(textbox);
        const count = count_location(container);

        socket.emit('focus_remove', { where: count });

    });

    textbox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            if (event.shiftKey) {
                return;
            }
            event.preventDefault();
            const value = textbox.value;
            const old_value = textbox.dataset.old_value;

            textbox.dataset.old_value = value;
            textbox.blur();
            textbox.dataset.old_value = old_value;
            if (!is_token(value)) {
                textbox.style.backgroundColor = 'rgb(255, 127, 127)';
                setTimeout(() => {
                    textbox.style.backgroundColor = '';
                }, 750);
                textbox.value = textbox.dataset.old_value;
                fix_textbox_width(textbox);
                return;
            }
            if (!try_use_change()) {
                textbox.value = textbox.dataset.old_value;
                fix_textbox_width(textbox);
                return;
            }
            const count = count_location(container);
            send_tokens_change({ type: 'edit_element', where: count, to: value }).then((res) => {
                if (!res) {
                    textbox.value = textbox.dataset.old_value;
                    fix_textbox_width(textbox);
                    return;
                }

                textbox.dataset.old_value = value;

                console.log('Elements before this one:', count);
                if (event.key === ' ') {
                    if (!try_use_change()) {
                        return;
                    }
                    const new_container = create_container_after(container);
                    new_container.focus();
                    send_tokens_change({ type: 'create_element', where: count }).then((res) => {
                        if (res == false) {
                            new_container.remove();
                            return;
                        }
                    })
                }
                else if (textbox.parentElement &&
                    textbox.parentElement.nextSibling &&
                    textbox.parentElement.nextSibling.className == 'token-container') {
                    textbox.parentElement.nextSibling.firstChild.focus();
                }
            })
        }

    });

    container.addEventListener('mouseout', () => {
        button.style.display = 'none';
    });




    button.addEventListener('click', () => {
        if (!try_use_change()) {
            return;
        }

        const count = count_location(container);
        console.log('Elements before this one:', count);
        const new_container = create_container_after(container);
        new_container.focus();

        send_tokens_change({ type: 'create_element', where: count })
            .then((res) => {
                if (res == false) {
                    new_container.remove();
                    return;
                }
            });

    });

    return container;
}

function create_container_after(container) {
    const new_container = createTokenTextbox();
    fix_textbox_width(new_container.firstChild);
    let next_non_break = container.nextSibling;
    if (!next_non_break) {
        container.parentNode.appendChild(new_container);
    }
    while (next_non_break && next_non_break.tagName === 'BR') {
        if (!next_non_break.nextSibling) {
            container.parentNode.appendChild(new_container);
            next_non_break = null;
            break;
        }
        next_non_break = next_non_break.nextSibling;

    }
    if (next_non_break) {
        container.parentNode.insertBefore(new_container, next_non_break);
    }
    return new_container
}

function get_nth_token(n) {
    let element = tokensHome.querySelectorAll('.token-container')[n];
    return element;
}

function interpretChange(change) {
    switch (change.type) {
        case 'create_element': {
            let element = get_nth_token(change.where);
            if (element) {
                create_container_after(element);
            }
        }
            break;

        case 'edit_element': {
            let element = get_nth_token(change.where);
            if (element) {
                const textbox = element.querySelector('input');
                textbox.value = change.to;
                fix_textbox_width(textbox);
            }
            break;
        }
        case 'delete_element': {
            let element = get_nth_token(change.where);
            if (element) {
                element.remove();
            }
        }
            break;

    }
}

function getAllTokens() {
    const tokens = [];
    const tokenElements = tokensHome.querySelectorAll('.token-container');
    tokenElements.forEach(container => {
        const textbox = container.querySelector('input');
        if (textbox) {
            tokens.push(textbox.dataset.old_value);
        }
    });
    return tokens;
}

async function send_tokens_change(change) {
    console.log(getAllTokens());
    let data = {
        change: change,
        working_hash: SHA256(JSON.stringify(getAllTokens())),
    }
    console.log(data)
    return new Promise((resolve) => {
        socket.emit('update_tokens', data, (response) => {
            remaining_changes = response.remaining_changes;
            fix_remaining_changes_label();

            if (!response.success) {
                alert('Failed to send tokens: ' + response.message);
                fetchAndDisplayTokens(); // Refresh tokens if the operation failed
                resolve(false); // Return false to indicate failure
            } else {
                resolve(true); // Return true to indicate success
            }
        });
    });
}


function millisecondsToTimeFormat(milliseconds) {
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
    const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);


    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const next_refresh_label = document.getElementById('next_refresh');



function check_refreshes() {
    while (next_refresh < Date.now()) {
        next_refresh = Date.now() + refresh_config.refresh_rate;
        remaining_changes++
        if (remaining_changes > refresh_config.max_tokens) {
            remaining_changes = refresh_config.max_tokens;
        }
    }
    // console.log("next_refresh ", next_refresh)
    next_refresh_label.textContent = 'Next refresh: ' + millisecondsToTimeFormat(new Date(next_refresh) - new Date());
    fix_remaining_changes_label()
}




const remaining_changes_label = document.getElementById('remaining_changes');
function fix_remaining_changes_label() {
    remaining_changes_label.textContent = 'Remaining changes: ' + remaining_changes;

}

socket.on('focus_token', (data) => {
    const count = data.where;
    const container = get_nth_token(count);
    if (container) {
        const bubble = container.querySelector('.speech-bubble');
        if (bubble) {
            bubble.textContent = data.username;
            bubble.style.display = 'block';
            if (bubble.dataset.timeout) {
                clearTimeout(bubble.dataset.timeout);
            }
            bubble.dataset.timeout = setTimeout(() => {
                if (bubble.textContent == data.username) {
                    bubble.style.display = 'none';
                }
            }, 10000);

        }
    }
})

socket.on('restart', (data) => {
    alert('Server is requsting you to restart. Refreshing the page...');
    location.reload();
})

socket.on('focus_remove', (data) => {
    const count = data.where;
    const container = get_nth_token(count);
    if (container) {
        const bubble = container.querySelector('.speech-bubble');
        if (bubble && bubble.textContent == data.username) {
            bubble.style.display = 'none';
        }
    }
})