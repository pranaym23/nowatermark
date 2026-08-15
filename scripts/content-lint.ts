import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, relative } from 'node:path';
import process from 'node:process';

/**
 * Represents the severity level of a linting issue.
 */
type LintLevel = 'ERROR' | 'WARN';

/**
 * Structure of an individual lint finding.
 */
interface LintFinding {
  level: LintLevel;
  line?: number;
  message: string;
}

/**
 * Result of parsing a frontmatter block.
 */
interface FrontmatterParseResult {
  data: Record<string, any>;
  warnings: Array<{ message: string; line: number }>;
  keyLineMap: Record<string, number>;
}

/**
 * Record of a parsed Markdown file with its metadata and findings.
 */
interface ScannedFile {
  filePath: string;
  relativePath: string;
  content: string;
  frontmatter: Record<string, any>;
  keyLineMap: Record<string, number>;
  frontmatterClosingLine: number;
  bodyContent: string;
  findings: LintFinding[];
}

/**
 * Permitted contentType values for guides.
 */
const ALLOWED_CONTENT_TYPES = ['guide', 'lab', 'comparison', 'answer'] as const;

/**
 * Mandatory top-level frontmatter keys.
 */
/*
 * `author` and `contentType` are deliberately absent: both carry defaults in
 * src/content.config.ts ('NoWatermark' and 'guide'), so an older guide that
 * omits them is valid, not broken. Requiring them here would flag 12 correct
 * files and teach everyone to ignore the output.
 */
const REQUIRED_FRONTMATTER_KEYS = [
  'title',
  'description',
  'summary',
  'publishDate',
  'order',
] as const;

/**
 * US spelling word list required for error-level detection.
 */
const US_SPELLING_WORDS = [
  'artifact',
  'artifacts',
  'behavior',
  'behaviors',
  'analyze',
  'analyzed',
  'analyzing',
  'sanitize',
  'sanitized',
  'organization',
  'organizations',
  'color',
  'colors',
  'recognize',
  'optimize',
] as const;

const US_SPELLINGS_REGEX = new RegExp(`\\b(${US_SPELLING_WORDS.join('|')})\\b`, 'gi');

/**
 * Patterns representing forbidden claims and unsubstantiated promises.
 */
/*
 * Claim checks.
 *
 * These are WARN, not ERROR, and the distinction is deliberate. The dangerous
 * sentence and the honest one are built from the same words: "no tool
 * guarantees bypassing AI detection" is exactly what this site should say, and
 * "this tool guarantees bypassing AI detection" is what it must never say. A
 * regex cannot reliably tell them apart, and the first version of this file
 * flagged every correct statement on the site as an error.
 *
 * A gate that cries wolf gets ignored, and then it catches nothing. So these
 * surface for a human to read, and the negation filter below removes the
 * obvious true negatives to keep the list short enough to actually read.
 */
const CLAIM_PATTERNS: Array<{ description: string; regex: RegExp }> = [
  { description: "'undetectable'", regex: /\bundetectable\b/gi },
  {
    description: "'guarantee' near 'detect'",
    regex: /(?:guarantee\w*[\s\S]{0,80}?detect|detect\w*[\s\S]{0,80}?guarantee)/gi,
  },
  {
    description: "'certify' near 'human'",
    regex: /(?:certif\w*[\s\S]{0,80}?human|human[\s\S]{0,80}?certif\w*)/gi,
  },
  { description: "'proves human'", regex: /\bproves\s+human\b/gi },
  { description: "removal of SynthID", regex: /\bremov(?:e|ing|es|ed)\s+synthid\b/gi },
  { description: "'100% accurate'", regex: /\b100%\s+accurate\b/gi },
];

/**
 * Words that turn a forbidden claim into a correct one.
 *
 * Checked in the run-up to the match, not inside it: "cannot" sits before
 * "remove SynthID", not within the phrase.
 */
const NEGATIONS =
  /\b(?:no|not|never|cannot|can't|cannot|don't|does not|doesn't|do not|without|nothing|refuse[sd]?|unable|impossible|neither|nor|why\s+it\s+does\s+not|instead\s+of)\b/i;

/** True when a negation appears shortly before the match, or inside it. */
function isNegated(text: string, index: number, matched: string): boolean {
  const runUp = text.slice(Math.max(0, index - 90), index);
  return NEGATIONS.test(runUp) || NEGATIONS.test(matched);
}

/**
 * Parses scalar string values into native primitives or cleaned strings.
 */
function parseScalar(val: string): any {
  const trimmed = val.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);

  // Single-quoted strings
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  // Double-quoted strings
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }

  return trimmed;
}

/**
 * Parses inline array strings such as ['tag1', 'tag2'].
 */
function parseInlineArray(raw: string): any[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  const items: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      }
      current += char;
    } else if (char === "'" || char === '"') {
      inQuote = char;
      current += char;
    } else if (char === ',') {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    items.push(current);
  }

  return items.map((item) => parseScalar(item));
}

/**
 * Lightweight, robust parser for the subset of YAML frontmatter used in content collections.
 */
function parseFrontmatter(lines: string[]): FrontmatterParseResult {
  const data: Record<string, any> = {};
  const warnings: Array<{ message: string; line: number }> = [];
  const keyLineMap: Record<string, number> = {};

  let currentTopKey: string | null = null;
  let currentList: any[] | null = null;
  let currentListItemObj: Record<string, any> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 2; // Line 1 is the opening '---'
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Top-level key: "key: value" or "key:"
    const topKeyMatch = rawLine.match(/^([a-zA-Z0-9_-]+):(?:\s*(.*))?$/);
    if (topKeyMatch) {
      const key = topKeyMatch[1];
      const rawVal = (topKeyMatch[2] ?? '').trim();
      currentTopKey = key;
      keyLineMap[key] = lineNum;
      currentListItemObj = null;

      if (rawVal === '') {
        currentList = [];
        data[key] = currentList;
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        data[key] = parseInlineArray(rawVal);
        currentList = null;
      } else {
        data[key] = parseScalar(rawVal);
        currentList = null;
      }
      continue;
    }

    // List item line: "  - key: value" or "  - item"
    const listItemMatch = rawLine.match(/^\s{2,4}-\s*(.*)$/);
    if (listItemMatch && currentTopKey) {
      const itemContent = listItemMatch[1].trim();

      // Bind through a local so the compiler can see this is never null on the
      // paths below; assigning straight from `data[...]` leaves it as `any`.
      const list: unknown[] = Array.isArray(data[currentTopKey]) ? data[currentTopKey] : [];
      data[currentTopKey] = list;
      currentList = list;

      const itemPropMatch = itemContent.match(/^([a-zA-Z0-9_-]+):(?:\s*(.*))?$/);
      if (itemPropMatch) {
        const propKey = itemPropMatch[1];
        const propVal = (itemPropMatch[2] ?? '').trim();
        currentListItemObj = {
          [propKey]:
            propVal.startsWith('[') && propVal.endsWith(']')
              ? parseInlineArray(propVal)
              : parseScalar(propVal),
        };
        currentList.push(currentListItemObj);
      } else {
        currentListItemObj = null;
        currentList.push(parseScalar(itemContent));
      }
      continue;
    }

    // Nested property in list item: "    nestedKey: value"
    const nestedPropMatch = rawLine.match(/^\s{4,8}([a-zA-Z0-9_-]+):(?:\s*(.*))?$/);
    if (nestedPropMatch && currentListItemObj) {
      const propKey = nestedPropMatch[1];
      const propVal = (nestedPropMatch[2] ?? '').trim();
      currentListItemObj[propKey] =
        propVal.startsWith('[') && propVal.endsWith(']')
          ? parseInlineArray(propVal)
          : parseScalar(propVal);
      continue;
    }

    warnings.push({
      message: `Unrecognized frontmatter structure: "${trimmed}"`,
      line: lineNum,
    });
  }

  return { data, warnings, keyLineMap };
}

/**
 * Recursively locates all Markdown files in a directory.
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (ext === '.md' || ext === '.mdx') {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Computes word count for a string.
 */
function countWords(text: string): number {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  return tokens.length;
}

/**
 * Checks if a matched word occurrence on a given line is part of a URL or colorProfile.
 */
function isIgnoredContext(line: string, matchIndex: number, matchText: string): boolean {
  const lower = matchText.toLowerCase();

  // Allow 'color' or 'colors' if inside 'colorProfile'
  if (lower === 'color' || lower === 'colors') {
    const surrounding = line.slice(
      Math.max(0, matchIndex - 12),
      Math.min(line.length, matchIndex + matchText.length + 12)
    );
    if (/colorprofile/i.test(surrounding)) {
      return true;
    }
  }

  // Check if inside standard HTTP/HTTPS URLs
  const urlRegex = /https?:\/\/[^\s)"]+/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(line)) !== null) {
    if (matchIndex >= urlMatch.index && matchIndex < urlMatch.index + urlMatch[0].length) {
      return true;
    }
  }

  // Check if inside markdown link destination `](...)`
  const mdTargetRegex = /\]\(([^)]+)\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdTargetRegex.exec(line)) !== null) {
    const startTarget = mdMatch.index + 2;
    const endTarget = mdMatch.index + mdMatch[0].length - 1;
    if (matchIndex >= startTarget && matchIndex <= endTarget) {
      return true;
    }
  }

  // Check if inside HTML src or href attributes
  const attrRegex = /(?:src|href)=["']([^"']+)["']/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(line)) !== null) {
    if (matchIndex >= attrMatch.index && matchIndex < attrMatch.index + attrMatch[0].length) {
      return true;
    }
  }

  return false;
}

/**
 * Validates an individual Markdown file and collects errors and warnings.
 */
async function lintFile(filePath: string, baseDir: string): Promise<ScannedFile> {
  const relativePath = relative(process.cwd(), filePath);
  const rawContent = await readFile(filePath, 'utf-8');
  const findings: LintFinding[] = [];
  const lines = rawContent.split(/\r?\n/);

  // Check 1: Frontmatter presence and delimiter structure
  if (lines.length === 0 || lines[0].trim() !== '---') {
    findings.push({
      level: 'ERROR',
      line: 1,
      message: 'Frontmatter missing or does not start with "---" on line 1',
    });
    return {
      filePath,
      relativePath,
      content: rawContent,
      frontmatter: {},
      keyLineMap: {},
      frontmatterClosingLine: 0,
      bodyContent: rawContent,
      findings,
    };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    findings.push({
      level: 'ERROR',
      line: 1,
      message: 'Frontmatter closing delimiter "---" not found',
    });
    return {
      filePath,
      relativePath,
      content: rawContent,
      frontmatter: {},
      keyLineMap: {},
      frontmatterClosingLine: 0,
      bodyContent: rawContent,
      findings,
    };
  }

  const fmLines = lines.slice(1, closingIndex);

  /*
   * YAML safety: an unquoted scalar containing ": " is a parse error, not a
   * style problem — `title: Thing: subtitle` fails the build. This lint's own
   * frontmatter parser is deliberately lenient, so it happily accepted two
   * files that Astro would have rejected. Catch it here instead.
   */
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i] ?? '';
    // Top-level `key: value`, and nested forms `  - key: value` / `    key: value`.
    // The nested case is not optional: the first version of this check only
    // looked at column zero and passed a file whose FAQ answer contained
    // "three forms: uncompressed", which broke the build.
    const m = /^[ \t]*(?:-[ \t]+)?([A-Za-z][\w]*):[ \t]+(.*)$/.exec(line);
    if (!m) continue;
    const value = (m[2] ?? '').trim();
    if (!value || value.startsWith("'") || value.startsWith('"') || value.startsWith('[')) continue;
    if (/:\s/.test(value)) {
      findings.push({
        level: 'ERROR',
        line: i + 2,
        message: `Unquoted '${m[1]}' contains ": " and will fail the YAML parse — wrap the value in single quotes`,
      });
    }
  }

  /*
   * The other half of the same trap, and the one that bit hardest: inside a
   * single-quoted YAML scalar an apostrophe must be doubled. Writing
   * `metaTitle: 'Google's watermark'` terminates the string early and fails
   * the build. Double quotes are the easy fix.
   */
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i] ?? '';
    const m = /^[ \t]*(?:-[ \t]+)?([A-Za-z][\w]*):[ \t]+'(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[2] ?? '';
    // Strip doubled quotes, then the legitimate closing quote at end of line.
    const body = rest.replace(/''/g, '').replace(/'\s*$/, '');
    if (body.includes("'")) {
      findings.push({
        level: 'ERROR',
        line: i + 2,
        message: `Single-quoted '${m[1]}' contains an unescaped apostrophe — use double quotes, or double it as ''`,
      });
    }
  }

  const { data: fm, warnings: parseWarnings, keyLineMap } = parseFrontmatter(fmLines);

  // Record frontmatter parse warnings
  for (const warning of parseWarnings) {
    findings.push({
      level: 'WARN',
      line: warning.line,
      message: warning.message,
    });
  }

  const bodyLines = lines.slice(closingIndex + 1);
  const bodyContent = bodyLines.join('\n');
  const bodyStartLine = closingIndex + 2;

  // Check 2: Required keys presence
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (fm[key] === undefined || fm[key] === null || fm[key] === '') {
      findings.push({
        level: 'ERROR',
        line: keyLineMap[key] ?? 1,
        message: `Missing required frontmatter key: '${key}'`,
      });
    }
  }

  // Check 3: contentType is one of: guide, lab, comparison, answer
  if (fm.contentType !== undefined && fm.contentType !== null && fm.contentType !== '') {
    const cTypeStr = String(fm.contentType).toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(cTypeStr as any)) {
      findings.push({
        level: 'ERROR',
        line: keyLineMap['contentType'] ?? 1,
        message: `Invalid 'contentType': '${fm.contentType}'. Must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      });
    }
  }

  // Check 4: If contentType is lab or comparison, lastTested must be present
  const currentContentType = String(fm.contentType ?? '').toLowerCase();
  if (currentContentType === 'lab' || currentContentType === 'comparison') {
    if (fm.lastTested === undefined || fm.lastTested === null || fm.lastTested === '') {
      findings.push({
        level: 'ERROR',
        line: keyLineMap['contentType'] ?? 1,
        message: `'lastTested' date is required when contentType is '${currentContentType}'`,
      });
    }
  }

  // Check 5: description length between 100 and 165 characters
  if (typeof fm.description === 'string') {
    const descLen = fm.description.length;
    if (descLen < 100 || descLen > 165) {
      findings.push({
        level: 'ERROR',
        line: keyLineMap['description'] ?? 1,
        message: `'description' length is ${descLen} characters (must be between 100 and 165 characters)`,
      });
    }
  }

  // Check 6: summary must not equal description
  if (
    typeof fm.summary === 'string' &&
    typeof fm.description === 'string' &&
    fm.summary.trim() === fm.description.trim()
  ) {
    findings.push({
      level: 'ERROR',
      line: keyLineMap['summary'] ?? 1,
      message: `'summary' must not be identical to 'description'`,
    });
  }

  // Check 7: metaTitle, if present, at most 65 characters
  if (fm.metaTitle !== undefined && fm.metaTitle !== null && fm.metaTitle !== '') {
    const metaTitleStr = String(fm.metaTitle);
    if (metaTitleStr.length > 65) {
      findings.push({
        level: 'ERROR',
        line: keyLineMap['metaTitle'] ?? 1,
        message: `'metaTitle' length is ${metaTitleStr.length} characters (maximum allowed is 65)`,
      });
    }
  }

  // Check 8 & 13: Body word count checks
  const wordCount = countWords(bodyContent);
  // Length is an editorial judgement, not a correctness property. Several of
  // the best pages here are short because the honest answer is short, so this
  // warns rather than blocking a build.
  if (wordCount < 600) {
    findings.push({
      level: 'WARN',
      line: bodyStartLine,
      message: `Body word count (${wordCount} words) is short; check it earns the brevity`,
    });
  } else if (wordCount > 2200) {
    findings.push({
      level: 'WARN',
      line: bodyStartLine,
      message: `Body word count (${wordCount} words) exceeds recommended maximum of 2200 words`,
    });
  }

  // Check 9: Body contains at least one markdown link of the form ](/
  if (!bodyContent.includes('](/')) {
    findings.push({
      level: 'ERROR',
      line: bodyStartLine,
      message: `Body must contain at least one internal markdown link matching pattern '](/...'`,
    });
  }

  // Check 10: No link whose visible text starts with a slash: [/ followed by anything then ](
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/\[\/[^\]]*\]\(/);
    if (match) {
      findings.push({
        level: 'ERROR',
        line: i + 1,
        message: `Raw slug used as visible link text: '${match[0]}'`,
      });
    }
  }

  // Check 11: claim phrases needing a human read. Negated forms are the
  // correct usage on this site, so they are filtered out rather than reported.
  for (const item of CLAIM_PATTERNS) {
    item.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = item.regex.exec(rawContent)) !== null) {
      if (isNegated(rawContent, match.index, match[0])) continue;
      const lineNum = rawContent.slice(0, match.index).split('\n').length;
      const snippet = match[0].replace(/\s+/g, ' ').slice(0, 70);
      findings.push({
        level: 'WARN',
        line: lineNum,
        message: `Claim needs review (${item.description}): "${snippet}"`,
      });
    }
  }

  // Check 12: US spellings, case-insensitive whole word
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    US_SPELLINGS_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = US_SPELLINGS_REGEX.exec(line)) !== null) {
      if (!isIgnoredContext(line, match.index, match[0])) {
        findings.push({
          level: 'ERROR',
          line: i + 1,
          message: `US spelling detected: '${match[0]}'`,
        });
      }
    }
  }

  // Check 14: faq block present but fewer than 3 questions
  if (fm.faq !== undefined) {
    const faqList = Array.isArray(fm.faq) ? fm.faq : [];
    if (faqList.length < 3) {
      findings.push({
        level: 'WARN',
        line: keyLineMap['faq'] ?? 1,
        message: `'faq' block contains ${faqList.length} questions (minimum recommended is 3)`,
      });
    }
  }

  // Check 16: File has neither relatedTools nor relatedGuides
  const hasRelatedTools = Array.isArray(fm.relatedTools)
    ? fm.relatedTools.length > 0
    : Boolean(fm.relatedTools);
  const hasRelatedGuides = Array.isArray(fm.relatedGuides)
    ? fm.relatedGuides.length > 0
    : Boolean(fm.relatedGuides);

  if (!hasRelatedTools && !hasRelatedGuides) {
    findings.push({
      level: 'WARN',
      line: 1,
      message: `File specifies neither 'relatedTools' nor 'relatedGuides'`,
    });
  }

  return {
    filePath,
    relativePath,
    content: rawContent,
    frontmatter: fm,
    keyLineMap,
    frontmatterClosingLine: closingIndex + 1,
    bodyContent,
    findings,
  };
}

/**
 * Cross-file validation: Identifies duplicate titles across files.
 */
function checkDuplicateTitles(scannedFiles: ScannedFile[]): void {
  const titleMap = new Map<string, ScannedFile[]>();

  for (const file of scannedFiles) {
    const title = file.frontmatter.title;
    if (typeof title === 'string' && title.trim().length > 0) {
      const normalized = title.trim();
      const existing = titleMap.get(normalized) ?? [];
      existing.push(file);
      titleMap.set(normalized, existing);
    }
  }

  for (const [title, files] of titleMap.entries()) {
    if (files.length > 1) {
      for (const file of files) {
        const otherPaths = files
          .filter((f) => f.filePath !== file.filePath)
          .map((f) => f.relativePath)
          .join(', ');

        file.findings.push({
          level: 'WARN',
          line: file.keyLineMap['title'] ?? 1,
          message: `Duplicate title '${title}' shared with: ${otherPaths}`,
        });
      }
    }
  }
}

/**
 * Main execution routine.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let targetDirectory = 'src/content/guides';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && i + 1 < argv.length) {
      targetDirectory = argv[i + 1];
      i++;
    }
  }

  const resolvedTarget = resolve(process.cwd(), targetDirectory);

  try {
    const stats = await stat(resolvedTarget);
    if (!stats.isDirectory()) {
      console.error(`ERROR: Target path '${targetDirectory}' is not a directory.`);
      process.exit(1);
    }
  } catch {
    console.error(`ERROR: Directory not found: '${targetDirectory}'`);
    process.exit(1);
  }

  const filePaths = await findMarkdownFiles(resolvedTarget);

  if (filePaths.length === 0) {
    console.log(`No Markdown files found in '${targetDirectory}'.`);
    process.exit(0);
  }

  const scannedFiles: ScannedFile[] = [];
  for (const filePath of filePaths) {
    const scanned = await lintFile(filePath, resolvedTarget);
    scannedFiles.push(scanned);
  }

  // Check 15: Two files sharing an identical title (cross-file check)
  checkDuplicateTitles(scannedFiles);

  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const file of scannedFiles) {
    if (file.findings.length > 0) {
      filesWithIssues++;

      // Sort findings by line number where available
      file.findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

      console.log(`\n${file.relativePath}`);
      for (const finding of file.findings) {
        if (finding.level === 'ERROR') {
          totalErrors++;
        } else {
          totalWarnings++;
        }

        const lineTag = finding.line !== undefined ? ` [line ${finding.line}]` : '';
        console.log(`  ${finding.level}${lineTag}: ${finding.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('CONTENT LINT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Files scanned:      ${scannedFiles.length}`);
  console.log(`Files with issues:  ${filesWithIssues}`);
  console.log(`Total errors:       ${totalErrors}`);
  console.log(`Total warnings:     ${totalWarnings}`);

  if (totalErrors > 0) {
    console.log(`\nResult: FAILED (${totalErrors} error-level check(s) failed). Exiting with code 1.`);
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log('\nResult: PASSED (with warnings). Exiting with code 0.');
    process.exit(0);
  } else {
    console.log('\nResult: PASSED (all checks clean). Exiting with code 0.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
