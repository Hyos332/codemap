import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGraph } from './analyze.js';
import { parseLog } from './history.js';
import { extractImports } from './imports.js';
import { parseRepo, repoSlug, repoUrl } from './repoRef.js';
import { groupOf, isTestFile } from './scan.js';
import type { Lang, RepoRef } from './types.js';

function graphOf(files: Record<string, string>, configs: Record<string, string> = {}) {
  const list = Object.entries(files).map(([path, content]) => ({
    path,
    content,
    lang: (path.endsWith('.py') ? 'py' : path.endsWith('.php') ? 'php' : path.endsWith('.vue') ? 'vue' : 'ts') as Lang,
  }));
  const { edges, externals } = buildGraph(list, new Map(Object.entries(configs)));
  return { edges: edges.map((e) => `${e.source} -> ${e.target}`).sort(), externals };
}

describe('parseRepo', () => {
  it('accepts the usual ways people paste a GitHub repo', () => {
    for (const input of ['vuejs/pinia', 'https://github.com/vuejs/pinia', 'github.com/vuejs/pinia.git', 'git@github.com:vuejs/pinia.git', 'https://github.com/vuejs/pinia/tree/v2/packages']) {
      assert.deepEqual(parseRepo(input), { provider: 'github', owner: 'vuejs', name: 'pinia' }, input);
    }
  });

  it('understands GitLab nested groups and Bitbucket workspaces', () => {
    const cases: [string, RepoRef][] = [
      ['https://gitlab.com/gitlab-org/frontend/playground/-/tree/main/src', { provider: 'gitlab', owner: 'gitlab-org/frontend', name: 'playground' }],
      ['git@gitlab.com:group/project.git', { provider: 'gitlab', owner: 'group', name: 'project' }],
      ['https://user@bitbucket.org/team/app.git', { provider: 'bitbucket', owner: 'team', name: 'app' }],
      ['bitbucket.org/team/app/src/main/README.md', { provider: 'bitbucket', owner: 'team', name: 'app' }],
    ];
    for (const [input, expected] of cases) assert.deepEqual(parseRepo(input), expected, input);
  });

  it('builds slugs and URLs that round-trip', () => {
    const ref = parseRepo('gitlab.com/a/b/c')!;
    assert.equal(repoSlug(ref), 'gitlab.com/a/b/c');
    assert.equal(repoUrl(ref), 'https://gitlab.com/a/b/c');
    assert.deepEqual(parseRepo(repoSlug(ref)), ref);
    assert.equal(repoSlug(parseRepo('https://github.com/a/b')!), 'a/b');
  });

  it('rejects anything that is not a plain repo path', () => {
    for (const input of ['', 'pinia', '../etc/passwd', 'a/..', 'owner/na me', 'https://example.com/a/b', 'gitlab.example.com/a/b']) {
      assert.equal(parseRepo(input), null, input);
    }
  });
});

describe('extractImports', () => {
  it('finds static, re-exported, dynamic and require imports, ignoring comments', () => {
    const code = `
      import React from 'react';
      import {
        a,
        b,
      } from './multi';
      import type { T } from "./types";
      export * from './barrel';
      const lazy = () => import('./lazy');
      const cjs = require('./cjs');
      // import nope from './commented';
      /* import alsoNope from './block'; */
      const url = 'https://example.com/x';
    `;
    assert.deepEqual(
      extractImports('ts', code).map((r) => r.spec),
      ['react', './multi', './types', './barrel', './lazy', './cjs'],
    );
  });

  it('reads Vue single-file components', () => {
    const sfc = `<template><Foo /></template>\n<script setup lang="ts">\nimport Foo from './Foo.vue'\n</script>`;
    assert.deepEqual(extractImports('vue', sfc).map((r) => r.spec), ['./Foo.vue']);
  });

  it('handles Python relative and parenthesised imports', () => {
    const code = 'from . import models, views as v\nfrom ..core.db import (\n  Session,\n  engine,\n)\nimport os, app.settings\n';
    assert.deepEqual(
      extractImports('py', code).map((r) => r.spec),
      ['.models', '.views', '..core.db.Session', '..core.db.engine', 'os', 'app.settings'],
    );
  });

  it('expands PHP group use statements', () => {
    const code = '<?php\nuse App\\Models\\{User, Post as P};\nuse Illuminate\\Support\\Str;\n';
    assert.deepEqual(
      extractImports('php', code).map((r) => r.spec),
      ['App\\Models\\User', 'App\\Models\\Post', 'Illuminate\\Support\\Str'],
    );
  });
});

describe('buildGraph', () => {
  it('resolves relative paths, index files and ESM .js imports of .ts files', () => {
    const { edges, externals } = graphOf({
      'src/main.ts': "import { x } from './lib'; import y from './util.js'; import z from 'zod';",
      'src/lib/index.ts': "import 'node:fs'; import '@scope/pkg/deep';",
      'src/util.ts': '',
    });
    assert.deepEqual(edges, ['src/main.ts -> src/lib/index.ts', 'src/main.ts -> src/util.ts']);
    assert.deepEqual(externals, [{ name: '@scope/pkg', count: 1 }, { name: 'zod', count: 1 }]);
  });

  it('follows tsconfig paths and the @/ convention', () => {
    const { edges } = graphOf(
      {
        'web/src/App.tsx': "import Button from '@ui/Button'; import api from '@/api';",
        'web/src/components/ui/Button.tsx': '',
        'web/src/api.ts': '',
      },
      {
        'web/package.json': '{ "name": "web" }',
        'web/tsconfig.app.json': `{
          // comments are allowed here
          "compilerOptions": { "paths": { "@ui/*": ["./src/components/ui/*"], }, },
        }`,
      },
    );
    assert.deepEqual(edges, ['web/src/App.tsx -> web/src/api.ts', 'web/src/App.tsx -> web/src/components/ui/Button.tsx']);
  });

  it('links workspace packages to their sources', () => {
    const { edges, externals } = graphOf(
      {
        'packages/app/src/index.ts': "import { core } from '@acme/core';",
        'packages/core/src/index.ts': '',
      },
      { 'packages/core/package.json': '{ "name": "@acme/core", "main": "dist/index.js" }' },
    );
    assert.deepEqual(edges, ['packages/app/src/index.ts -> packages/core/src/index.ts']);
    assert.deepEqual(externals, []);
  });

  it('resolves Python packages and PSR-4 classes', () => {
    const { edges, externals } = graphOf(
      {
        'app/__init__.py': '',
        'app/views.py': 'from . import models\nfrom app.core import db\nimport requests\nimport os',
        'app/models.py': '',
        'app/core/db.py': '',
        'app/Http/Controller.php': '<?php\nuse App\\Models\\User;\nuse Illuminate\\Http\\Request;\nuse HasFactory;',
        'app/Models/User.php': '',
      },
      { 'composer.json': '{ "autoload": { "psr-4": { "App\\\\": "app/" } } }' },
    );
    assert.deepEqual(edges, [
      'app/Http/Controller.php -> app/Models/User.php',
      'app/views.py -> app/core/db.py',
      'app/views.py -> app/models.py',
    ]);
    assert.deepEqual(externals.map((e) => e.name).sort(), ['Illuminate', 'requests']);
  });
});

describe('parseLog', () => {
  it('counts commits per file and skips the shallow boundary', () => {
    const log = [
      '\u001eaaa\u001fAna\u001f2026-10-02T10:00:00Z\n\nsrc/a.ts\nsrc/b.ts\n',
      '\u001ebbb\u001fLuis\u001f2026-10-01T10:00:00Z\n\nsrc/a.ts\n',
      '\u001eccc\u001fAna\u001f2026-09-01T10:00:00Z\n\nsrc/a.ts\nsrc/b.ts\nsrc/c.ts\n',
    ].join('');
    const history = parseLog(log, new Set(['ccc']));
    assert.equal(history.commits, 2);
    assert.equal(history.since, '2026-10-01T10:00:00Z');
    assert.deepEqual(history.files.get('src/a.ts'), { commits: 2, authors: new Set(['Ana', 'Luis']), lastChange: '2026-10-02T10:00:00Z' });
    assert.equal(history.files.has('src/c.ts'), false);
  });
});

describe('scan helpers', () => {
  it('groups files by meaningful folder', () => {
    assert.equal(groupOf('README.ts'), '/');
    assert.equal(groupOf('src/components/Button.tsx'), 'src/components');
    assert.equal(groupOf('src/main.ts'), 'src');
    assert.equal(groupOf('packages/core/src/index.ts'), 'packages/core');
    assert.equal(groupOf('resources/js/Pages/Home.vue'), 'resources/js/Pages');
  });

  it('recognises test files across languages', () => {
    assert.ok(isTestFile('src/a.test.ts'));
    assert.ok(isTestFile('tests/test_views.py'));
    assert.ok(isTestFile('tests/Feature/UserTest.php'));
    assert.ok(!isTestFile('src/testing-utils.ts'));
  });
});
