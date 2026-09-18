import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the rider search page');
}

describe('rider search pages', () => {
  it('places the search entry below race selection and links to its own page', () => {
    const landing = new JSDOM(readFileSync(resolve(root, 'index.html'), 'utf8'));
    const main = landing.window.document.querySelector('main');
    const sections = [...(main?.children || [])];
    const raceIndex = sections.findIndex((node) => node.classList.contains('race-list'));
    const searchIndex = sections.findIndex((node) => node.classList.contains('search-section'));
    expect(raceIndex).toBeGreaterThanOrEqual(0);
    expect(searchIndex).toBeGreaterThan(raceIndex);
    expect(main?.querySelector('.search-section a')?.getAttribute('href')).toBe('riders.html');
    landing.window.close();
  });

  it('suggests riders and groups real stage results by race, including abbreviated names', async () => {
    const page = new JSDOM(readFileSync(resolve(root, 'riders.html'), 'utf8'), {
      url: 'https://example.test/riders.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        (window as any).fetch = async (path: string) => ({
          ok: true,
          json: async () => JSON.parse(readFileSync(resolve(root, path), 'utf8')),
        });
      },
    });
    try {
      const { document, Event } = page.window;
      const input = document.getElementById('riderQuery') as HTMLInputElement;
      await waitFor(() => !input.disabled);

      input.value = 'Vingegaard';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelectorAll('#suggestions button').length).toBeGreaterThan(0);
      (document.querySelector('#suggestions button') as HTMLButtonElement).click();
      await waitFor(
        () =>
          document.querySelectorAll('.race-result').length === 2 &&
          !!document.querySelector('.stage-table tbody tr:nth-child(2)'),
      );

      expect(document.getElementById('riderName')?.textContent).toBe('Jonas VINGEGAARD');
      expect(document.querySelector('.race-result .empty-stages')?.textContent).toContain(
        'not available',
      );
      expect(
        document.querySelector('.stage-table tbody tr:nth-child(2) td:nth-child(2)')?.textContent,
      ).toBe('4');

      input.value = 'Enric MAS NICOLAU';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document
        .getElementById('searchForm')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitFor(
        () =>
          document.getElementById('riderName')?.textContent === 'Enric MAS NICOLAU' &&
          !!document.querySelector('.stage-table tbody tr:nth-child(2)'),
      );
      expect(
        document.querySelector('.stage-table tbody tr:nth-child(2) td:nth-child(2)')?.textContent,
      ).not.toBe('—');
    } finally {
      page.window.close();
    }
  });
});
