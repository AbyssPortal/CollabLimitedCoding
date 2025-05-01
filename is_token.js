function is_token(word) {
    // Trim spaces from the sides
    const trimmed = word.trim();

    // Check if it's a string literal of the form 'smth' or "smth"
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return true;
    }

    // Check if it's a single word (after trimming spaces)
    return /^[^\w]*\w*[^\w]*$/.test(trimmed);
}

function test_tokens() {
    console.log(true, " =?= ", is_token("'hello'")); // true (string literal)
    console.log(true, " =?= ", is_token('"world"')); // true (string literal)
    console.log(true, " =?= ", is_token("   token   ")); // true (single word with spaces trimmed)
    console.log(false, " =?= ", is_token("not a token")); // false (contains spaces)
    console.log(true, " =?= ", is_token("!@#$%^&*()")); // true (single word with special characters)
    console.log(true, " =?= ", is_token("   ")); // true (empty after trimming)
    console.log(true, " =?= ", is_token("(hello);")); // true (word with special characters)
    console.log(false, " =?= ", is_token("one==two")); // false (contains multiple words or invalid pattern)
}



module.exports = { is_token };
