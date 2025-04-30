function is_token(word) {
    // Trim spaces from the sides
    const trimmed = word.trim();

    // Check if it's a string literal of the form 'smth' or "smth"
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || 
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return true;
    }

    // Check if it's a single word (after trimming spaces)
    return /^[^\s]+$/.test(trimmed);
}

console.log(is_token("'hello'")); // true (string literal)
console.log(is_token('"world"')); // true (string literal)
console.log(is_token("   token   ")); // true (single word with spaces trimmed)
console.log(is_token("not a token")); // false (contains spaces)
console.log(is_token("!@#$%^&*()")); // true (single word with special characters)
console.log(is_token("   ")); // false (empty after trimming)
console.log(is_token("(hello);")); // true (word with special characters)


module.exports = { is_token };
