// Smoke test for src/tour-page.ts: loads dist/race-page.js and dist/tour-page.js
// as classic scripts (see race-page.test.ts) and checks the shared Tour helpers exist.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const FUNCTIONS = [
  'applyStaticText',
  'initStageMap',
  'loadResults',
  'loadRiders',
  'loadWeather',
  'renderAll',
  'renderGeneralRankings',
  'renderProfile',
  'renderRankSelect',
  'renderResults',
  'renderRiders',
  'renderStageList',
  'renderStageResult',
  'renderTopStats',
  'resultRowHTML',
  'selectStage',
  'setLang',
  'syncStageListHeight',
];
const g = globalThis as any;

beforeAll(() => {
  for (const f of ['race-page.js', 'tour-page.js']) {
    const p = resolve(process.cwd(), 'dist', f);
    runInThisContext(readFileSync(p, 'utf8'), { filename: p });
  }
});

describe('tour-page', () => {
  it.each(FUNCTIONS)('defines %s', (name) => {
    expect(typeof g[name]).toBe('function');
  });

  it('escapes the team url and name in renderRiders', () => {
    const grid = { innerHTML: '' };
    g.document = { getElementById: () => grid };
    g.lang = 'en';
    g.STRINGS = { en: { teamClsLine: () => '', teamClsNone: '', teamsStatus: () => '' } };
    g.RIDERS = {
      teams: [{ name: 'A"B', url: 'x" onclick="y', riders: [] }],
      riderCount: 0,
      finishers: 0,
      teamCount: 1,
    };
    g.renderRiders();
    expect(grid.innerHTML).toContain('href="x&quot; onclick=&quot;y"');
    expect(grid.innerHTML).toContain('A&quot;B');
  });
});
