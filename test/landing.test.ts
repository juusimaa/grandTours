import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

function load(url = 'https://example.test/', savedYear?: string): JSDOM {
  return new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    beforeParse(window) {
      if (savedYear) window.localStorage.setItem('gt-year', savedYear);
    },
  });
}

const raceLinks = (page: JSDOM) =>
  [...page.window.document.querySelectorAll('#raceList a.race')].map((a) => a.getAttribute('href'));
const activeYear = (page: JSDOM) =>
  page.window.document.querySelector('#yearSel .yearbtn.active')?.textContent;

describe('landing page year picker', () => {
  it('defaults to 2027, where no race route is published yet', () => {
    const page = load();
    const { document } = page.window;
    expect(activeYear(page)).toBe('2027');
    expect(document.getElementById('footerYear')?.textContent).toBe('2027');
    expect(raceLinks(page)).toEqual([]);
    expect(document.querySelectorAll('#raceList .race.is-upcoming')).toHaveLength(4);
    page.window.close();
  });

  it('switches to 2026 race pages and remembers the choice', () => {
    const page = load();
    const { document, localStorage } = page.window;
    (document.querySelector('#yearSel [data-year="2026"]') as HTMLButtonElement).click();
    expect(activeYear(page)).toBe('2026');
    expect(raceLinks(page)).toEqual([
      '2026/giro.html',
      '2026/tdf.html',
      '2026/femmes.html',
      '2026/vuelta.html',
    ]);
    expect(localStorage.getItem('gt-year')).toBe('2026');
    page.window.close();
  });

  it('honours a saved year, and a ?year= link over it', () => {
    const saved = load('https://example.test/', '2026');
    expect(activeYear(saved)).toBe('2026');
    saved.window.close();

    const linked = load('https://example.test/?year=2027', '2026');
    expect(activeYear(linked)).toBe('2027');
    linked.window.close();

    const unknown = load('https://example.test/?year=1999');
    expect(activeYear(unknown)).toBe('2027');
    unknown.window.close();
  });
});
