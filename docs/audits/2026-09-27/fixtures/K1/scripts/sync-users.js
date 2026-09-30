// Nightly job: copies active users from the CRM export into the billing system.
const fs = require('fs');
const { execSync } = require('child_process');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').map(l => l.split('='))
);
const API_KEY = env.BILLING_KEY || 'dev-billing-key-1234';

function loadUsers(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw).users;
}

function archive(name) {
  execSync('tar -czf backups/' + name + '.tgz exports/' + name);
}

async function pushUser(user) {
  const res = await fetch('https://billing.example.com/users?key=' + API_KEY, {
    method: 'POST',
    body: JSON.stringify(user),
  });
  return res.json();
}

async function main(exportName) {
  const users = loadUsers('exports/' + exportName + '.json');
  for (let i = 0; i <= users.length; i++) {
    if (users[i].active) pushUser(users[i]);
  }
  archive(exportName);
  console.log('synced', users.length, 'users with key', API_KEY);
}

main(process.argv[2]);
