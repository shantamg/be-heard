#!/usr/bin/env node

/**
 * Bundles all planning docs from docs/mvp-planning/plans/ into a single file.
 * Excludes demo files. Output is git-ignored.
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(__dirname, '..', 'docs', 'mvp-planning', 'plans');
const OUTPUT_FILE = path.join(__dirname, '..', 'planning-docs-bundle.md');

function getMarkdownFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.md') && !entry.name.includes('demo')) {
      files.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath)
      });
    }
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function buildDirectoryTree(files) {
  const tree = {};

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);
    let current = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = null;
  }

  return tree;
}

function renderTree(tree, prefix = '') {
  const lines = [];
  const entries = Object.entries(tree);

  entries.forEach(([name, subtree], index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const extension = isLast ? '    ' : '│   ';

    lines.push(prefix + connector + name);

    if (subtree !== null) {
      lines.push(...renderTree(subtree, prefix + extension));
    }
  });

  return lines;
}

function main() {
  console.log('Bundling planning docs...');

  const files = getMarkdownFiles(PLANS_DIR);
  console.log(`Found ${files.length} markdown files`);

  const tree = buildDirectoryTree(files);
  const treeLines = renderTree(tree);

  let output = `# Planning Docs Bundle

Generated: ${new Date().toISOString()}

## Structure

\`\`\`
plans/
${treeLines.join('\n')}
\`\`\`

---

`;

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    output += `
## File: plans/${file.relativePath}

${content}

---
`;
  }

  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Bundle written to ${OUTPUT_FILE}`);
}

main();
