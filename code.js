

changes_list = [];
token_increment = 0;


socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

const tokensHome = document.getElementById('tokens_home');




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
    let remaining_changes_label = document.getElementById('remaining_changes');

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
    // button.className = 'squircle-button';
    button.textContent = '+';
    button.style.display = 'none';

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
            let value = textbox.value;
            textbox.value = textbox.dataset.old_value;
            fix_textbox_width(textbox);

            textbox.blur();

            if (!try_use_change()) {
                return;
            }
            const count = count_location(container);
            send_tokens_change({ type: 'edit_element', where: count, to: value }).then((res) => {
                if (!res) {
                    return;
                }

                textbox.dataset.old_value = value;
                textbox.value = value;
                fix_textbox_width(textbox);

                console.log('Elements before this one:', count);
                if (event.key === ' ') {
                    if (!try_use_change()) {
                        return;
                    }

                    send_tokens_change({ type: 'create_element', where: count }).then((res) => {
                        if (res == true) {
                            const new_container = createTokenTextbox();
                            container.parentNode.insertBefore(new_container, container.nextSibling);
                            new_container.firstChild.focus();
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

        const count = Array.from(container.parentNode.children).indexOf(container);
        console.log('Elements before this one:', count);
        send_tokens_change({ type: 'create_element', where: count })
            .then((res) => {
                if (res == true) {
                    const new_container = createTokenTextbox();
                    container.parentNode.insertBefore(new_container, container.nextSibling);
                }
            });

    });

    return container;
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
                const new_container = createTokenTextbox();
                element.parentNode.insertBefore(new_container, element.nextSibling);
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
            tokens.push(textbox.value);
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
        next_refresh = Date.now() + 1000 * 60;
        remaining_changes++
        if (remaining_changes > 10) {
            remaining_changes = 10;
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
            bubble.dataset.timeout =            setTimeout(() => {
                if (bubble.textContent == data.username) {
                    bubble.style.display = 'none';
                }
            }, 10000);

        }
    }
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