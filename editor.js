import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { ViewPlugin, Decoration } from '@codemirror/view';
import { MergeView } from '@codemirror/merge';

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

// Determine theme: use localStorage if set, otherwise follow system preference
let isDark;
const savedTheme = localStorage.getItem('theme');
if (savedTheme !== null) {
  isDark = savedTheme === 'dark';
} else {
  // Follow system theme
  isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

theme.checked = isDark;

// Sync checkbox with the dark-mode class that was set earlier
if (isDark && !document.documentElement.classList.contains('dark-mode')) {
  document.documentElement.classList.add('dark-mode');
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

// Create diff viewer using MergeView
const diffContainer = document.getElementById('diffViewer');
const extensions = [basicSetup, sql(), EditorView.lineWrapping];
if (isDark) {
  extensions.push(oneDark);
}

const mergeView = new MergeView({
  a: {
    doc: localStorage.getItem('oldSchema') || exampleOld,
    extensions
  },
  b: {
    doc: localStorage.getItem('newSchema') || exampleNew,
    extensions
  },
  parent: diffContainer
});

// Update listeners
oldEditor.dom.addEventListener('input', () => {
  const value = oldEditor.state.doc.toString();
  localStorage.setItem('oldSchema', value);
  updateAlterSchema(oldEditor, newEditor, alterEditor);
  mergeView.a.dispatch({
    changes: { from: 0, to: mergeView.a.state.doc.length, insert: value }
  });
});

newEditor.dom.addEventListener('input', () => {
  const value = newEditor.state.doc.toString();
  localStorage.setItem('newSchema', value);
  updateAlterSchema(oldEditor, newEditor, alterEditor);
  mergeView.b.dispatch({
    changes: { from: 0, to: mergeView.b.state.doc.length, insert: value }
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
    mergeView.a.dispatch({
      changes: { from: 0, to: mergeView.a.state.doc.length, insert: content }
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
    mergeView.b.dispatch({
      changes: { from: 0, to: mergeView.b.state.doc.length, insert: content }
    });
  };
  reader.readAsText(file);
});

// Theme toggle
window.toggleTheme = function () {
  const isDark = theme.checked;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  // Toggle dark-mode class
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }

  // Reload to apply theme (CodeMirror theme needs to be set at initialization)
  location.reload();
};
