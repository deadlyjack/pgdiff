// Test script for DROP TABLE and RENAME TABLE detection
// Run with: node test.js

const fs = require('fs');
const path = require('path');

// Read and evaluate script.js to load the functions
const scriptPath = path.join(__dirname, 'script.js');
let scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Replace browser-specific keywords with Node.js equivalents before eval
// (in case script.js contains window, document, etc.)
// For now, script.js is clean, but this helps future-proof the test

// If script.js doesn't define process (browser environment), provide polyfill
if (!scriptContent.includes('const process') && !scriptContent.includes('var process')) {
  // The script already uses process.stdout.write which is Node.js native, so we're good
  // But if it were browser code using 'window', we'd do:
  // scriptContent = scriptContent.replace(/\bwindow\b/g, 'global');
}

eval(scriptContent);

// Test case from user's example
console.log('=== Test Case: DROP and RENAME detection ===\n');

const oldSchema = `
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    current_mood mood DEFAULT 'ok'
);
CREATE TABLE test ( id SERIAL PRIMARY KEY);
`;

const newSchema = `
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TABLE user (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150),
    current_mood mood DEFAULT 'happy',
    age INT
);
`;

const alters = generateSchemaAlters(oldSchema, newSchema);

console.log('Generated ALTER statements:');
console.log('----------------------------');
alters.forEach((cmd, i) => {
  console.log(`${i + 1}. ${cmd}`);
});
console.log('\nExpected results:');
console.log('- person table should be renamed to user');
console.log('- test table should be dropped');
console.log('- name column should change from VARCHAR(100) to VARCHAR(150)');
console.log('- current_mood default should change from \'ok\' to \'happy\'');
console.log('- age column should be added to user table');

// Test case 2: Adding default constraint to existing column
console.log('\n\n=== Test Case 2: Adding DEFAULT constraint ===\n');

const oldSchema2 = `
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    status VARCHAR(20)
);
`;

const newSchema2 = `
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) DEFAULT 'Unknown',
    status VARCHAR(20)
);
`;

const alters2 = generateSchemaAlters(oldSchema2, newSchema2);

console.log('Generated ALTER statements:');
console.log('----------------------------');
if (alters2.length === 0) {
  console.log('(No changes detected)');
} else {
  alters2.forEach((cmd, i) => {
    console.log(`${i + 1}. ${cmd}`);
  });
}
console.log('\nExpected: ALTER TABLE person ALTER COLUMN name SET DEFAULT \'Unknown\';');

// Test case 3: Completely different tables (should DROP old, CREATE new)
console.log('\n\n=== Test Case 3: Completely different tables ===\n');

const oldSchema3 = `
CREATE TABLE IF NOT EXISTS branch (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT,
  logo TEXT,
  invoice_image TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES business(id)
);
`;

const newSchema3 = `
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy', 'excited');
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150),
    current_mood mood DEFAULT 'happy',
    age INT
);
`;

const alters3 = generateSchemaAlters(oldSchema3, newSchema3);

console.log('Generated ALTER statements:');
console.log('----------------------------');
if (alters3.length === 0) {
  console.log('(No statements generated)');
}
alters3.forEach((cmd, i) => {
  console.log(`${i + 1}. ${cmd}`);
});
console.log('\nExpected:');
console.log('- CREATE TYPE mood AS ENUM (...)');
console.log('- DROP TABLE branch');
console.log('- CREATE TABLE person (...)');

// Test case 4: Syntax errors and validation
console.log('\n\n=== Test Case 4: Syntax Errors ===\n');

const invalidSchema1 = `
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100
`;

const invalidSchema2 = `
CREATE TYPE mood AS ENUM ('sad', 'ok'
`;

const invalidSchema3 = `
CREATE TABLE person (
`;

const validSchema = `
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100)
);
`;

console.log('Test 4a: Unbalanced parentheses in old schema');
const alters4a = generateSchemaAlters(invalidSchema1, validSchema);
console.log(alters4a.join('\n'));

console.log('\n\nTest 4b: Incomplete ENUM definition');
const alters4b = generateSchemaAlters(validSchema, invalidSchema2);
console.log(alters4b.join('\n'));

console.log('\n\nTest 4c: Incomplete table definition');
const alters4c = generateSchemaAlters(validSchema, invalidSchema3);
console.log(alters4c.join('\n'));

console.log('\n\nTest 4d: Empty column definition');
const invalidSchema4 = `CREATE TABLE person ();`;
const alters4d = generateSchemaAlters(validSchema, invalidSchema4);
console.log(alters4d.join('\n'));

// Test case 5: Incomplete DEFAULT clause
console.log('\n\n=== Test Case 5: Incomplete DEFAULT clause ===\n');

const oldSchema5 = `
CREATE TABLE IF NOT EXISTS branch (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT,
  logo TEXT,
  invoice_image TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES business(id)
);
`;

const newSchema5 = `
CREATE TABLE IF NOT EXISTS branch (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT,
  logo TEXT DEFAULT,
  invoice_image TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES business(id)
);
`;

const alters5 = generateSchemaAlters(oldSchema5, newSchema5);
console.log('Generated:');
console.log(alters5.join('\n'));
console.log('\nExpected: -- ERROR: Column \'logo\' has DEFAULT keyword but no value specified');
