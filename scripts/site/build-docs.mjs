import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const docsDir = join(rootDir, 'site', 'docs');
const outputFile = join(rootDir, 'site', 'docs.html');

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseInline(text) {
    return text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function parseTable(lines) {
    const headerLine = lines[0];
    const separatorLine = lines[1];
    
    if (!separatorLine || !/^\|[\s\-:|]+\|?$/.test(separatorLine.trim())) {
        return null;
    }
    
    const headers = headerLine
        .split('|')
        .slice(1, -1)
        .map(cell => parseInline(cell.trim()));
    
    let html = '<table>\n<thead>\n<tr>';
    headers.forEach(h => {
        html += `<th>${h}</th>`;
    });
    html += '</tr>\n</thead>\n<tbody>\n';
    
    let i = 2;
    while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
            .split('|')
            .slice(1, -1)
            .map(cell => parseInline(cell.trim()));
        html += '<tr>';
        cells.forEach(cell => {
            html += `<td>${cell}</td>`;
        });
        html += '</tr>\n';
        i++;
    }
    
    html += '</tbody>\n</table>';
    
    return { html, usedLines: i };
}

function parseList(lines) {
    let html = '<ul>\n';
    let i = 0;
    
    while (i < lines.length && lines[i].trim().startsWith('- ')) {
        const content = parseInline(lines[i].trim().substring(2));
        html += `<li>${content}</li>\n`;
        i++;
    }
    
    html += '</ul>';
    return { html, usedLines: i };
}

function parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    let html = '';
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        
        if (line.trim() === '') {
            i++;
            continue;
        }
        
        if (line.startsWith('```')) {
            let codeLines = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++;
            html += '<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>\n';
            continue;
        }
        
        if (line.startsWith('### ')) {
            html += `<h3>${parseInline(line.substring(4))}</h3>\n`;
            i++;
            continue;
        }
        
        if (line.startsWith('## ')) {
            html += `<h2>${parseInline(line.substring(3))}</h2>\n`;
            i++;
            continue;
        }
        
        if (line.startsWith('# ')) {
            html += `<h1>${parseInline(line.substring(2))}</h1>\n`;
            i++;
            continue;
        }
        
        if (line.trim().startsWith('|')) {
            const tableResult = parseTable(lines.slice(i));
            if (tableResult) {
                html += tableResult.html + '\n';
                i += tableResult.usedLines;
                continue;
            }
        }
        
        if (line.trim().startsWith('- ')) {
            const listResult = parseList(lines.slice(i));
            html += listResult.html + '\n';
            i += listResult.usedLines;
            continue;
        }
        
        let paragraph = [];
        while (i < lines.length && 
               lines[i].trim() !== '' && 
               !lines[i].startsWith('#') && 
               !lines[i].startsWith('```') && 
               !lines[i].trim().startsWith('|') && 
               !lines[i].trim().startsWith('- ')) {
            paragraph.push(lines[i].trim());
            i++;
        }
        
        if (paragraph.length > 0) {
            const content = parseInline(paragraph.join(' '));
            html += `<p>${content}</p>\n`;
        }
    }
    
    return html;
}

function getSectionId(heading) {
    return heading
        .toLowerCase()
        .replace(/[&\s]+/g, '-');
}

function extractH1(markdown) {
    const lines = markdown.split('\n');
    for (const line of lines) {
        if (line.startsWith('# ')) {
            return line.substring(2).trim();
        }
    }
    return null;
}

function getNavTitle(fileName, markdown) {
    const h1 = extractH1(markdown);
    if (h1) {
        return h1;
    }
    return fileName.replace(/^\d+-/, '').replace(/\.md$/, '');
}

function main() {
    const files = readdirSync(docsDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    
    let sectionsHtml = '';
    let navLinks = [];
    let tableCount = 0;
    let headingCount = 0;
    
    for (const file of files) {
        const content = readFileSync(join(docsDir, file), 'utf-8');
        const h1 = extractH1(content) || file.replace(/^\d+-/, '').replace(/\.md$/, '');
        const sectionId = getSectionId(h1);
        const navTitle = getNavTitle(file, content);
        
        const body = parseMarkdown(content);
        tableCount += (body.match(/<table>/g) || []).length;
        headingCount += (body.match(/<h[123][^>]*>/g) || []).length;
        
        sectionsHtml += `<section id="${sectionId}">\n${body}</section>\n`;
        navLinks.push(`<a href="#${sectionId}">${navTitle}</a>`);
    }
    
    const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>lANTS Market — Docs</title>
    <link rel="stylesheet" href="app.css">
    <style>
        .doc-layout {
            display: grid;
            grid-template-columns: 240px 1fr;
            gap: 2rem;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
        }
        .doc-nav {
            position: sticky;
            top: 1rem;
            align-self: start;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            padding: 1rem;
            border: 1px solid var(--line);
            border-radius: 8px;
        }
        .doc-nav a {
            color: var(--accent);
            text-decoration: none;
            font-family: var(--font-sans);
            font-size: 0.9rem;
            padding: 0.25rem 0;
            border-bottom: 1px solid var(--line);
        }
        .doc-nav a:last-child {
            border-bottom: none;
        }
        .doc-main {
            min-width: 0;
        }
        .doc-main table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        .doc-main table th,
        .doc-main table td {
            border: 1px solid var(--line);
            padding: 0.5rem 1rem;
            text-align: left;
        }
        .doc-main table th {
            background: var(--bg);
            color: var(--ink);
            font-weight: bold;
        }
        .doc-main table td {
            color: var(--ink);
        }
        .doc-main pre {
            background: var(--bg);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            margin: 1rem 0;
        }
        .doc-main pre code {
            font-family: var(--font-mono);
            font-size: 0.9rem;
            color: var(--ink);
            line-height: 1.6;
        }
        .doc-main section {
            margin-bottom: 3rem;
            border-bottom: 1px solid var(--line);
            padding-bottom: 2rem;
        }
        .doc-main section:last-child {
            border-bottom: none;
        }
        @media (max-width: 860px) {
            .doc-layout {
                grid-template-columns: 1fr;
                gap: 1rem;
            }
            .doc-nav {
                position: static;
                flex-direction: row;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            .doc-nav a {
                border-bottom: none;
                padding: 0.25rem 0.5rem;
                background: var(--bg);
                border: 1px solid var(--line);
                border-radius: 4px;
            }
        }
    </style>
</head>
<body>
    <header style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid var(--line);">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 24px; height: 24px; background: var(--accent); border-radius: 6px;"></div>
            <span style="font-family: var(--font-mono); color: var(--ink);">lANTS</span>
        </div>
        <a href="index.html" style="color: var(--accent); text-decoration: none; font-family: var(--font-sans);">Back to market</a>
    </header>
    <div class="doc-layout">
        <nav class="doc-nav">
            ${navLinks.join('\n            ')}
        </nav>
        <main class="doc-main">
            ${sectionsHtml}
        </main>
    </div>
    <footer style="text-align: center; padding: 2rem; border-top: 1px solid var(--line); color: var(--muted); font-family: var(--font-sans);">
        <a href="index.html" style="color: var(--accent);">index.html</a> — Marketplace contract adapted from Vexy by @0xValde
    </footer>
</body>
</html>`;

    writeFileSync(outputFile, page, 'utf-8');
    
    const bytes = Buffer.byteLength(page, 'utf-8');
    
    console.log(`docs_sections=${files.length}`);
    console.log(`docs_bytes=${bytes}`);
    console.log(`docs_headings=${headingCount}`);
    console.log(`docs_tables=${tableCount}`);
    
    if (files.length !== 6 || headingCount < 20 || tableCount < 5) {
        process.exit(1);
    }
}

main();