import type { Lang } from './types.js';

export interface ImportRef {
  kind: 'js' | 'py' | 'php-class' | 'php-path';
  spec: string;
  fallback?: string;
}

export function extractImports(lang: Lang, content: string): ImportRef[] {
  switch (lang) {
    case 'ts':
    case 'js':
      return jsImports(content);
    case 'vue':
    case 'svelte':
      return scriptBlocks(content).flatMap(jsImports);
    case 'py':
      return pyImports(content);
    case 'php':
      return phpImports(content);
  }
}

const JS_STATIC = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s*)?['"]([^'"\n]+)['"]/g;
const JS_CALL = /\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

function jsImports(content: string): ImportRef[] {
  const code = stripCComments(content);
  const refs: ImportRef[] = [];
  for (const re of [JS_STATIC, JS_CALL]) {
    for (const m of code.matchAll(re)) refs.push({ kind: 'js', spec: m[1]! });
  }
  return refs;
}

function scriptBlocks(content: string): string[] {
  return [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
}

const PY_FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;
const PY_IMPORT = /^[ \t]*import[ \t]+([^\n#]+)/gm;

function pyImports(content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  for (const m of content.matchAll(PY_FROM)) {
    const module = m[1]!;
    for (const name of splitNames(m[2]!)) {
      if (name === '*') {
        refs.push({ kind: 'py', spec: module });
        continue;
      }
      const sub = module.endsWith('.') ? `${module}${name}` : `${module}.${name}`;
      refs.push({ kind: 'py', spec: sub, fallback: module });
    }
  }
  for (const m of content.matchAll(PY_IMPORT)) {
    for (const name of splitNames(m[1]!)) refs.push({ kind: 'py', spec: name });
  }
  return refs;
}

function splitNames(list: string): string[] {
  return list
    .replace(/[()\\]/g, ' ')
    .split(',')
    .map(withoutAlias)
    .filter((name) => /^[\w.*]+$/.test(name));
}

const PHP_USE = /^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?\\?([\w\\]+)(?:[ \t]*\{([^}]*)\})?/gm;
const PHP_PATH = /\b(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"\n]+\.php)['"]/g;

function phpImports(content: string): ImportRef[] {
  const code = stripCComments(content).replace(/(^|\s)#(?!\[).*$/gm, '$1');
  const refs: ImportRef[] = [];
  for (const m of code.matchAll(PHP_USE)) {
    const base = m[1]!;
    if (m[2] !== undefined) {
      for (const name of m[2].split(',')) {
        const clean = withoutAlias(name);
        if (clean) refs.push({ kind: 'php-class', spec: `${base.replace(/\\$/, '')}\\${clean}` });
      }
    } else {
      refs.push({ kind: 'php-class', spec: base });
    }
  }
  for (const m of code.matchAll(PHP_PATH)) refs.push({ kind: 'php-path', spec: m[1]! });
  return refs;
}

function stripCComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[ \t;{}])\/\/.*$/gm, '$1');
}

function withoutAlias(name: string): string {
  return name.trim().split(/\s+as\s+/i)[0]!.trim();
}
