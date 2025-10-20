import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { ViewPlugin, Decoration } from '@codemirror/view';

const exampleOld = `CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    current_mood mood DEFAULT 'ok'
);`;

const exampleNew = `CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy', 'excited');
CREATE TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150),
    current_mood mood DEFAULT 'happy',
    age INT
);`;

const theme = document.getElementById('dark-theme');
const isDark = localStorage.getItem('theme') === 'dark';
if (isDark) {
  theme.checked = true;
}

// Line decoration for ERROR and CAUTION lines
const lineDecorations = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const decorations = [];
    const doc = view.state.doc;

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text;

      if (/^--\s*ERROR:/i.test(text)) {
        decorations.push(Decoration.line({ class: 'error-line' }).range(line.from));
      } else if (/^--\s*CAUTION:/i.test(text) || /^\s*DROP\s+TABLE/i.test(text)) {
        decorations.push(Decoration.line({ class: 'caution-line' }).range(line.from));
      }
    }

    return Decoration.set(decorations);
  }
}, {
  decorations: v => v.decorations
});

function createEditor(parent, initialValue, readOnly = false, withDecorations = false) {
  const extensions = [
    basicSetup,
    sql(),
    EditorView.lineWrapping,
    EditorView.editable.of(!readOnly)
  ];

  if (isDark) {
    extensions.push(oneDark);
  }

  if (withDecorations) {
    extensions.push(lineDecorations);
  }

  const view = new EditorView({
    doc: initialValue,
    extensions,
    parent
  });

  return view;
}

function updateAlterSchema(oldEditor, newEditor, alterEditor) {
  const oldSchema = oldEditor.state.doc.toString();
  const newSchema = newEditor.state.doc.toString();
  const alters = generateSchemaAlters(oldSchema, newSchema);

  alterEditor.dispatch({
    changes: {
      from: 0,
      to: alterEditor.state.doc.length,
      insert: alters.join('\n')
    }
  });
}

// Create editors
const oldEditor = createEditor(
  document.getElementById('oldSchema'),
  localStorage.getItem('oldSchema') || exampleOld
);

const newEditor = createEditor(
  document.getElementById('newSchema'),
  localStorage.getItem('newSchema') || exampleNew
);

const alterEditor = createEditor(
  document.getElementById('alterSchema'),
  generateSchemaAlters(
    localStorage.getItem('oldSchema') || exampleOld,
    localStorage.getItem('newSchema') || exampleNew
  ).join('\n'),
  true,
  true
);

// Simple diff viewer - just show both schemas side by side
const diffContainer = document.getElementById('diffViewer');
const diffBorderColor = isDark ? '#444' : '#ccc';
const diffBgColor = isDark ? '#252525' : '#f0f0f0';
const diffTextColor = isDark ? '#cfcfcf' : '#000';

diffContainer.innerHTML = `
  <div style="display: flex; height: 100%; overflow: auto;">
    <div style="flex: 1; overflow: auto; border-right: 1px solid ${diffBorderColor};">
      <div class="diff-title" style="padding: 5px; background: ${diffBgColor}; color: ${diffTextColor}; font-weight: bold; border-bottom: 1px solid ${diffBorderColor};">Old Schema</div>
      <div id="diffOld" style="height: calc(100% - 30px);"></div>
    </div>
    <div style="flex: 1; overflow: auto;">
      <div class="diff-title" style="padding: 5px; background: ${diffBgColor}; color: ${diffTextColor}; font-weight: bold; border-bottom: 1px solid ${diffBorderColor};">New Schema</div>
      <div id="diffNew" style="height: calc(100% - 30px);"></div>
    </div>
  </div>
`;

const diffOldEditor = createEditor(
  document.getElementById('diffOld'),
  localStorage.getItem('oldSchema') || exampleOld,
  true
);

const diffNewEditor = createEditor(
  document.getElementById('diffNew'),
  localStorage.getItem('newSchema') || exampleNew,
  true
);

// Update listeners
oldEditor.dom.addEventListener('input', () => {
  const value = oldEditor.state.doc.toString();
  localStorage.setItem('oldSchema', value);
  updateAlterSchema(oldEditor, newEditor, alterEditor);
  diffOldEditor.dispatch({
    changes: { from: 0, to: diffOldEditor.state.doc.length, insert: value }
  });
});

newEditor.dom.addEventListener('input', () => {
  const value = newEditor.state.doc.toString();
  localStorage.setItem('newSchema', value);
  updateAlterSchema(oldEditor, newEditor, alterEditor);
  diffNewEditor.dispatch({
    changes: { from: 0, to: diffNewEditor.state.doc.length, insert: value }
  });
});

// File upload handlers
document.getElementById('oldSchemaFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    oldEditor.dispatch({
      changes: { from: 0, to: oldEditor.state.doc.length, insert: content }
    });
    localStorage.setItem('oldSchema', content);
    updateAlterSchema(oldEditor, newEditor, alterEditor);
    diffOldEditor.dispatch({
      changes: { from: 0, to: diffOldEditor.state.doc.length, insert: content }
    });
  };
  reader.readAsText(file);
});

document.getElementById('newSchemaFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    newEditor.dispatch({
      changes: { from: 0, to: newEditor.state.doc.length, insert: content }
    });
    localStorage.setItem('newSchema', content);
    updateAlterSchema(oldEditor, newEditor, alterEditor);
    diffNewEditor.dispatch({
      changes: { from: 0, to: diffNewEditor.state.doc.length, insert: content }
    });
  };
  reader.readAsText(file);
});

// Theme toggle
window.toggleTheme = function () {
  const isDark = theme.checked;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  // Reload to apply theme (CodeMirror theme needs to be set at initialization)
  location.reload();
};
