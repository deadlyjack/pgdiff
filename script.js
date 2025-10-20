/**
 * Given two SQL statements, generates an array of ALTER commands to modify the
 * schema of the first statement to match the second statement.
 *
 * @param {string} oldStatement - The SQL statement defining the original schema
 * @param {string} newStatement - The SQL statement defining the target schema
 * @returns {string[]} An array of ALTER commands to modify the schema
 *
 * Note: This function does not handle changes to existing columns, or addition
 * of new tables. It is intended for modifying the enum values of user-defined
 * types, and adding new columns to existing tables.
 */
function generateSchemaAlters(oldStatement, newStatement) {
  const commands = [];

  // Validate schemas first
  try {
    const oldSchema = parseSchema(oldStatement);
    const newSchema = parseSchema(newStatement);

    // Check if schemas are empty or invalid
    if (Object.keys(oldSchema.tables).length === 0 && Object.keys(oldSchema.types).length === 0) {
      if (oldStatement.trim().length > 0) {
        commands.push('-- ERROR: Old schema appears to be invalid or incomplete. No valid CREATE TABLE or CREATE TYPE statements found.');
        return commands;
      }
    }

    if (Object.keys(newSchema.tables).length === 0 && Object.keys(newSchema.types).length === 0) {
      if (newStatement.trim().length > 0) {
        commands.push('-- ERROR: New schema appears to be invalid or incomplete. No valid CREATE TABLE or CREATE TYPE statements found.');
        return commands;
      }
    }

    return generateSchemaAltersInternal(oldSchema, newSchema);
  } catch (error) {
    commands.push(`-- ERROR: ${error.message}`);
    return commands;
  }
}

function generateSchemaAltersInternal(oldSchema, newSchema) {
  // Main comparison logic
  const commands = [];

  // Track which old/new tables have been matched for rename detection
  const oldTableMatched = new Set();
  const newTableMatched = new Set();

  // Handle type changes
  for (const [typeName, newType] of Object.entries(newSchema.types)) {
    const oldType = oldSchema.types[typeName];

    if (!oldType) {
      // New type - will be created at the end
      continue;
    }

    if (newType.type === 'enum') {
      // Check enum value changes
      for (let i = 0; i < oldType.values.length; i++) {
        if (oldType.values[i] !== newType.values[i]) {
          commands.push(`-- ERROR: Cannot modify existing enum value in ${typeName}\n`);
        }
      }

      // Add new enum values
      for (const value of newType.values.slice(oldType.values.length)) {
        commands.push(`ALTER TYPE ${typeName} ADD VALUE '${value}';`);
      }
    } else if (newType.definition !== oldType.definition) {
      commands.push(`-- ERROR: Composite type ${typeName} definition changed`);
      break;
    }
  }

  // Helper: Calculate column similarity between two tables (0 to 1)
  function columnSimilarity(oldCols, newCols) {
    if (oldCols.length === 0 && newCols.length === 0) return 1;
    if (oldCols.length === 0 || newCols.length === 0) return 0;

    const oldNames = new Set(oldCols.map((c) => c.name));
    const newNames = new Set(newCols.map((c) => c.name));
    const intersection = [...oldNames].filter((n) => newNames.has(n)).length;
    const union = new Set([...oldNames, ...newNames]).size;

    const similarity = intersection / union;

    // Require at least 3 matching columns OR 70% similarity for rename detection
    // This prevents false matches on common columns like 'id' and 'name'
    if (intersection < 3 && similarity < 0.7) return 0;

    return similarity;
  }

  // Detect table renames: match old tables to new tables by column similarity
  const renameMap = new Map(); // old table name -> new table name

  for (const [oldTableName, oldColumns] of Object.entries(oldSchema.tables)) {
    // Skip if already in new schema with same name
    if (newSchema.tables[oldTableName]) {
      oldTableMatched.add(oldTableName);
      newTableMatched.add(oldTableName);
      continue;
    }

    // Find best matching new table by column similarity
    let bestMatch = null;
    let bestScore = 0;

    for (const [newTableName, newColumns] of Object.entries(newSchema.tables)) {
      if (newTableMatched.has(newTableName)) continue;

      const score = columnSimilarity(oldColumns, newColumns);
      if (score > bestScore && score >= 0.5) {
        // Threshold: at least 50% column overlap
        bestScore = score;
        bestMatch = newTableName;
      }
    }

    if (bestMatch) {
      // This is a rename
      renameMap.set(oldTableName, bestMatch);
      oldTableMatched.add(oldTableName);
      newTableMatched.add(bestMatch);
      commands.push(`ALTER TABLE ${oldTableName} RENAME TO ${bestMatch};`);
    }
  }

  // Handle table changes (including renamed tables)
  for (const [tableName, newColumns] of Object.entries(newSchema.tables)) {
    // Skip tables that will be created as new
    if (!newTableMatched.has(tableName)) {
      continue;
    }

    // Find the old table name (might be renamed)
    let oldTableName = tableName;
    for (const [oldName, newName] of renameMap.entries()) {
      if (newName === tableName) {
        oldTableName = oldName;
        break;
      }
    }

    const oldColumns = oldSchema.tables[oldTableName] || [];
    const columnMap = new Map(oldColumns.map((c) => [c.name, c]));

    // Add new columns
    for (const newCol of newColumns) {
      const oldCol = columnMap.get(newCol.name);

      if (!oldCol) {
        if (newCol.notNull && !newCol.defaultValue) {
          throw new Error(`New column ${tableName}.${newCol.name} is NOT NULL without default`);
        }

        let def = `${newCol.name} ${newCol.type}`;
        if (newCol.defaultValue) {
          def += ` DEFAULT ${newCol.defaultValue}`;
        }
        if (newCol.notNull) {
          def += ' NOT NULL';
        }
        commands.push(`ALTER TABLE ${tableName} ADD COLUMN ${def};`);
      }
    }

    // Modify existing columns
    for (const newCol of newColumns) {
      const oldCol = columnMap.get(newCol.name);
      if (!oldCol) {
        continue;
      }

      // Type check (including user-defined types)
      if (newCol.type !== oldCol.type) {
        // Drop default before type change
        if (oldCol.defaultValue) {
          commands.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} DROP DEFAULT;`);
        }

        const type = newCol.type.replace(/\s+PRIMARY KEY$/, '');
        let alterCommand = `ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} TYPE ${type}`;

        const oldTypeUpper = oldCol.type.toUpperCase();
        const newTypeUpper = type.toUpperCase();

        if (newTypeUpper === 'BOOLEAN') {
          if (oldTypeUpper.startsWith('VARCHAR') || oldTypeUpper === 'TEXT') {
            alterCommand += ` USING CASE WHEN ${newCol.name} = 'true' THEN true ELSE false END`;
          } else if (
            ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'SERIAL', 'BIGSERIAL'].includes(oldTypeUpper)
          ) {
            alterCommand += ` USING ${newCol.name} != 0`;
          } else {
            alterCommand += ` USING ${newCol.name}::boolean`;
          }
        }

        commands.push(`${alterCommand};`);

        // Set new default after type change
        if (newCol.defaultValue) {
          commands.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} SET DEFAULT ${newCol.defaultValue};`);
        }

        if (oldCol.type.includes('PRIMARY KEY')) {
          commands.push(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_pkey;`);
        }

        if (newCol.type.includes('PRIMARY KEY')) {
          commands.push(`ALTER TABLE ${tableName} ADD PRIMARY KEY (${newCol.name});`);
        }
      } else if (newCol.defaultValue !== oldCol.defaultValue) {
        // Default value change (when type does not change)
        if (newCol.defaultValue) {
          commands.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} SET DEFAULT ${newCol.defaultValue};`);
        } else {
          commands.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} DROP DEFAULT;`);
        }
      }

      // Null constraint change
      if (newCol.notNull !== oldCol.notNull) {
        commands.push(`ALTER TABLE ${tableName} ALTER COLUMN ${newCol.name} ${newCol.notNull ? 'SET NOT NULL;' : 'DROP NOT NULL;'}`);
      }
    }

    // Remove deleted columns
    for (const oldCol of oldColumns) {
      if (!newColumns.find((c) => c.name === oldCol.name)) {
        commands.push(`ALTER TABLE ${tableName} DROP COLUMN ${oldCol.name};`);
      }
    }
  }

  // Create new types first (before new tables that might use them)
  for (const typeName of Object.keys(newSchema.types)) {
    if (!oldSchema.types[typeName]) {
      const typeData = newSchema.types[typeName];
      if (typeData.type === 'enum') {
        const values = typeData.values.map((v) => `'${v}'`).join(', ');
        commands.push(`CREATE TYPE ${typeName} AS ENUM (${values});`);
      }
    }
  }

  // Detect table replacements: old table dropped + new table created with similar columns
  const tableReplacements = new Map(); // old table name -> new table name

  for (const oldTableName of Object.keys(oldSchema.tables)) {
    if (oldTableMatched.has(oldTableName)) continue; // Already matched as rename

    const oldColumns = oldSchema.tables[oldTableName];

    // Find best matching new table
    let bestMatch = null;
    let bestScore = 0;

    for (const newTableName of Object.keys(newSchema.tables)) {
      if (newTableMatched.has(newTableName)) continue; // Already used

      const newColumns = newSchema.tables[newTableName];
      const score = columnSimilarity(oldColumns, newColumns);

      if (score > bestScore && score >= 0.3) {
        // Lower threshold for data migration
        bestScore = score;
        bestMatch = newTableName;
      }
    }

    if (bestMatch) {
      tableReplacements.set(oldTableName, bestMatch);
    }
  }

  // Create new tables (with data migration for replacements)
  for (const newTableName of Object.keys(newSchema.tables)) {
    if (!newTableMatched.has(newTableName)) {
      const newColumns = newSchema.tables[newTableName];

      // Check if this is replacing an old table
      let oldTableName = null;
      for (const [oldName, newName] of tableReplacements.entries()) {
        if (newName === newTableName) {
          oldTableName = oldName;
          break;
        }
      }

      // Generate CREATE TABLE statement
      const columnDefs = newColumns.map((col) => {
        let def = `  ${col.name} ${col.type}`;
        if (col.defaultValue) {
          def += ` DEFAULT ${col.defaultValue}`;
        }
        if (col.notNull) {
          def += ' NOT NULL';
        }
        return def;
      });
      commands.push(`CREATE TABLE ${newTableName} (\n${columnDefs.join(',\n')}\n);`);

      // If replacing, add data migration
      if (oldTableName) {
        const oldColumns = oldSchema.tables[oldTableName];
        const oldColMap = new Map(oldColumns.map((c) => [c.name, c]));

        // Find matching columns
        const matchingColumns = newColumns
          .filter((newCol) => oldColMap.has(newCol.name))
          .map((col) => col.name);

        if (matchingColumns.length > 0) {
          commands.push(`-- Migrate data from '${oldTableName}' to '${newTableName}'`);
          const columnList = matchingColumns.join(', ');
          commands.push(`INSERT INTO ${newTableName} (${columnList}) SELECT ${columnList} FROM ${oldTableName};`);
        }
      }
    }
  }

  // Detect dropped tables (old tables not matched/renamed and not being replaced)
  for (const oldTableName of Object.keys(oldSchema.tables)) {
    if (!oldTableMatched.has(oldTableName)) {
      commands.push(`-- CAUTION: This will permanently delete table '${oldTableName}' and all its data!`);
      commands.push(`DROP TABLE ${oldTableName};`);
    }
  }

  return commands;
}

function parseSchema(statement) {
  const schema = { types: {}, tables: {} };

  // Remove comments and normalize whitespace, but keep semicolons for splitting
  const cleaned = statement.replace(/--.*?\n/g, '\n').replace(/["`]/g, '').trim();

  if (!cleaned) {
    return schema; // Empty schema is valid
  }

  // Check for basic syntax errors
  const openParens = (cleaned.match(/\(/g) || []).length;
  const closeParens = (cleaned.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    throw new Error(`Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`);
  }

  // Split into individual statements by semicolon (but allow semicolons inside parens by a simple heuristic)
  const rawStatements = cleaned
    .split(/;(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of rawStatements) {
    // Skip empty
    if (!stmt) continue;

    const s = stmt.replace(/\s+/g, ' ').trim();

    // Parse CREATE TYPE
    if (/^CREATE TYPE/i.test(s)) {
      const typeMatch = s.match(/CREATE TYPE (\S+) AS (ENUM\s*\(([^)]+)\)|([^;]+))/i);
      if (!typeMatch) {
        throw new Error(`Invalid CREATE TYPE syntax: ${s.substring(0, 50)}...`);
      }

      const typeName = typeMatch[1];
      if (typeMatch[3]) {
        // ENUM
        const values = typeMatch[3].split(/, ?/).map((v) => v.replace(/'/g, '').trim());
        if (values.length === 0) {
          throw new Error(`ENUM type '${typeName}' has no values`);
        }
        schema.types[typeName] = { type: 'enum', values };
      } else {
        // Composite type
        schema.types[typeName] = { type: 'composite', definition: typeMatch[4].trim() };
      }

      continue;
    }

    // Parse CREATE TABLE
    const tableMatch = s.match(/CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\S+)\s+\((.*)\)/i);
    if (!tableMatch) {
      // Check if it looks like an incomplete CREATE TABLE
      if (/^CREATE TABLE/i.test(s)) {
        throw new Error(`Incomplete or invalid CREATE TABLE statement: ${s.substring(0, 50)}...`);
      }
      // Not a CREATE TYPE or CREATE TABLE statement - ignore for now
      continue;
    }

    const tableName = tableMatch[1];
    const columnPart = tableMatch[2];

    if (!columnPart || columnPart.trim().length === 0) {
      throw new Error(`Table '${tableName}' has no columns defined`);
    }

    const columns = [];
    const columnDefs = columnPart
      .split(/,(?![^(]*\))/)
      .map((x) => x.trim())
      .filter((x) => !x.match(/^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE)/i));

    if (columnDefs.length === 0) {
      throw new Error(`Table '${tableName}' has no valid column definitions`);
    }

    for (const def of columnDefs) {
      const tokens = def.split(/\s+/);

      if (tokens.length < 2) {
        throw new Error(`Invalid column definition in table '${tableName}': ${def}`);
      }

      let pos = 0;
      const column = { name: tokens[pos++], type: '', notNull: false, defaultValue: null };

      // Parse type (handle nested parentheses)
      const typeParts = [];
      while (pos < tokens.length && !['DEFAULT', 'NOT', 'NULL', 'CHECK'].includes(tokens[pos].toUpperCase())) {
        typeParts.push(tokens[pos++]);
      }
      column.type = typeParts.join(' ');

      if (!column.type) {
        throw new Error(`Column '${column.name}' in table '${tableName}' has no type specified`);
      }

      // Parse constraints
      while (pos < tokens.length) {
        const token = tokens[pos++].toUpperCase();
        if (token === 'NOT' && tokens[pos]?.toUpperCase() === 'NULL') {
          column.notNull = true;
          pos++;
        } else if (token === 'DEFAULT') {
          const defaultValue = tokens.slice(pos).join(' ');
          if (!defaultValue || defaultValue.trim().length === 0) {
            throw new Error(`Column '${column.name}' in table '${tableName}' has DEFAULT keyword but no value specified`);
          }
          column.defaultValue = defaultValue;
          pos = tokens.length;
        }
      }

      columns.push(column);
    }

    // Merge if table already parsed earlier in the input
    if (!schema.tables[tableName]) {
      schema.tables[tableName] = columns;
    } else {
      // If parsed multiple CREATE TABLEs for same name, prefer later definitions
      schema.tables[tableName] = columns;
    }
  }

  return schema;
}
