# PostgreSQL Schema Auto-Update

A lightweight tool for generating PostgreSQL ALTER statements to migrate database schemas. This project analyzes differences between two SQL schema definitions and automatically generates the necessary ALTER commands to transform the old schema into the new one.

## What does this do?

When working with PostgreSQL databases, schema changes are a common requirement. This tool helps automate the process by:

- Detecting changes in custom types (ENUM additions, composite types)
- Identifying new columns and generating appropriate ALTER TABLE ADD COLUMN statements
- Recognizing column type changes and creating ALTER TABLE ALTER COLUMN statements with proper USING clauses
- Handling default value and NOT NULL constraint modifications
- Detecting table renames by analyzing column similarity
- Identifying dropped tables and generating DROP TABLE statements
- Managing column deletions within existing tables

The tool is smart enough to handle complex scenarios like renaming tables based on column structure matching, ensuring you don't accidentally drop and recreate tables when they've simply been renamed.

## Features

- Support for multiple SQL statements in a single input
- Intelligent table rename detection using column similarity matching
- Automatic handling of PostgreSQL type conversions
- Detection of dropped tables and columns
- Notifications for genuinely new tables that require CREATE TABLE statements
- Browser-based interface for easy access
- Command-line testing support via Node.js

## Live Demo

Try it out at: [pgdiff.foxdebug.com](https://pgdiff.foxdebug.com)

## Usage

### Browser

Open `index.html` in your browser. Paste your old schema in the first textarea and your new schema in the second textarea. The tool will generate the necessary ALTER statements to migrate from the old schema to the new one.

### Command Line

Run the test script to see example usage:

```bash
node test.js
```

## Example

Given an old schema:

```sql
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    current_mood mood DEFAULT 'ok'
);
CREATE TABLE test (id SERIAL PRIMARY KEY);
```

And a new schema:

```sql
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TABLE user (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150),
    current_mood mood DEFAULT 'happy',
    age INT
);
```

The tool generates:

```sql
ALTER TABLE person RENAME TO user;
ALTER TABLE user ADD COLUMN age INT;
ALTER TABLE user ALTER COLUMN name TYPE VARCHAR(150);
ALTER TABLE user ALTER COLUMN current_mood SET DEFAULT 'happy';
DROP TABLE test;
```

## How it works

The tool parses both SQL schemas into internal representations, then performs a detailed comparison. It uses a column similarity algorithm to detect table renames (matching threshold of 50% or higher column overlap). Changes are categorized and appropriate ALTER statements are generated in the correct order to ensure successful migration.

## Limitations

- Does not generate CREATE TABLE statements for new tables (only notifies)
- Cannot modify existing ENUM values (only add new ones)
- Assumes standard PostgreSQL syntax
- Primary key changes require manual review

## Development

The project consists of:

- `script.js` - Core parsing and comparison logic
- `index.html` - Browser interface
- `test.js` - Command-line testing utility

## License

This project is open source and available for use in your own projects.
