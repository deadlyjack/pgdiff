# Schema Validation and Error Highlighting

## Features Implemented

### 1. Syntax Validation in parseSchema()

The script now detects and reports the following errors:

#### Unbalanced Parentheses

```sql
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100
-- ERROR: Unbalanced parentheses: 2 opening, 0 closing
```

#### Incomplete CREATE TYPE

```sql
CREATE TYPE mood AS ENUM ('sad', 'ok'
-- ERROR: Unbalanced parentheses: 1 opening, 0 closing
```

#### Empty Table Definitions

```sql
CREATE TABLE person ();
-- ERROR: Table 'person' has no columns defined
```

#### Invalid Column Definitions

```sql
CREATE TABLE person (
    name
);
-- ERROR: Column 'name' in table 'person' has no type specified
```

#### Empty ENUM Types

```sql
CREATE TYPE mood AS ENUM ();
-- ERROR: ENUM type 'mood' has no values
```

### 2. Monaco Editor Highlighting

The Monaco editor now provides visual highlighting for different types of important comments:

#### Error Comments (-- ERROR:)

Error comments (starting with `-- ERROR:`) are displayed:

- **Main text in bold red** (#ff0000)
- **Quoted strings in bold orange** (#ff6600) for better visibility
- **Automatically detected** using custom tokenization

#### Caution Comments (-- CAUTION:)

Caution comments (starting with `-- CAUTION:`) are displayed:

- **Main text in bold amber** (#ff9900)
- **Quoted strings in bold yellow** (#ffcc00) for better visibility
- Used primarily for **DROP TABLE** warnings
- **Automatically detected** using custom tokenization

#### Implementation Details

The Monaco editor is configured with:

1. **Custom Theme** (`errorCommentTheme`):

   - `comment.error` → red (#ff0000), bold
   - `comment.error.quoted` → orange (#ff6600), bold
   - `comment.caution` → amber (#ff9900), bold
   - `comment.caution.quoted` → yellow (#ffcc00), bold

2. **Custom Tokenizer with State Machine**:

   - `/--\s*ERROR:/` → transitions to `@errorComment` state
   - `/--\s*CAUTION:/` → transitions to `@cautionComment` state
   - Within each state, `/'[^']*'/` matches quoted strings and applies special highlighting
   - Applied to SQL language

3. **Visual Feedback**:
   - Normal comments remain gray
   - Error comments appear in bold red with orange quoted names
   - Caution comments appear in bold amber with yellow quoted names
   - Helps users quickly identify both the issue and the affected objects

#### Examples

**Error Comment:**

```sql
-- ERROR: Column 'logo' in table 'branch' has DEFAULT keyword but no value specified
```

Display:

- `-- ERROR: Column ` → **bold red**
- `'logo'` → **bold orange**
- `in table` → **bold red**
- `'branch'` → **bold orange**
- ` has DEFAULT keyword but no value specified` → **bold red**

**Caution Comment:**

```sql
-- CAUTION: This will permanently delete table 'branch' and all its data!
DROP TABLE branch;
```

Display:

- `-- CAUTION: This will permanently delete table ` → **bold amber**
- `'branch'` → **bold yellow**
- ` and all its data!` → **bold amber**

### 3. DROP TABLE Safety Warning

Every `DROP TABLE` statement is now preceded by a caution comment:

```sql
-- CAUTION: This will permanently delete table 'tablename' and all its data!
DROP TABLE tablename;
```

This ensures users are aware of the destructive nature of the operation before executing it.

### 3. Error Handling in generateSchemaAlters()

The main function now:

- Wraps parsing in try-catch blocks
- Validates both old and new schemas
- Returns error messages as comments
- Prevents crashes from malformed input

## Usage

### In Browser

1. Open `index.html`
2. Paste invalid SQL in either editor
3. Error comments appear in red in the "Alter Schema" tab

### In Tests

```bash
node test.js
```

Test Case 4 demonstrates all error detection scenarios.

## Example Output

Given this invalid input:

```sql
CREATE TABLE person (
    id SERIAL PRIMARY KEY
```

The Alter Schema editor will show:

```sql
-- ERROR: Unbalanced parentheses: 1 opening, 0 closing
```

And the text will appear in **bold red** in the Monaco editor.
