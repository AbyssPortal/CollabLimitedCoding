const fs = require('fs');
const path = require('path');

const arg = process.argv[2];

if (arg === undefined) {
  console.error('Usage: node make_root.js <username>');
  process.exit(1);
}

var users = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'))));




if (!users.has(arg)) {
  console.error(`User ${arg} does not exist`);
  process.exit(1);
}

(users.get(arg)).root = true;


fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(Array.from(users.entries()), null, 2));
