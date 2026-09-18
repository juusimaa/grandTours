import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const results = JSON.parse(readFileSync(resolve(root, 'data/giro2026-results.json'), 'utf8'));

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the Giro rankings page');
}

// Run the compiled shared script inline so JSDOM exercises the actual Giro page.
function openPage(stageResults = results.stageResults): JSDOM {
  const shared = readFileSync(resolve(root, 'dist/race-page.js'), 'utf8');
  const page = readFileSync(resolve(root, '2026/giro.html'), 'utf8');
  const html = page.replace(
    '<script src="../dist/race-page.js"></script>',
    `<script>${shared}</script>`,
  );
  return new JSDOM(html, {
    url: 'https://example.test/2026/giro.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as any).fetch = async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes('giro2026-results.json')
            ? { ...results, stageResults }
            : JSON.parse(readFileSync(resolve(root, url.replace('../', '')), 'utf8')),
      });
    },
  });
}

describe('Giro Rankings tab', () => {
  it('selects any stage, expands the full order, and retains selection across languages', async () => {
    const page = openPage();
    try {
      const { document, Event } = page.window;
      const select = document.getElementById('rankStageSelect') as HTMLSelectElement;
      await waitFor(() => select.options.length === 22);
      expect(document.getElementById('tabResults')?.textContent).toBe('Rankings');
      expect(document.getElementById('rankSelectLabel')?.textContent).toBe('Show');
      expect(select.value).toBe('general');
      expect(document.querySelector('#view-results .clsgrid')).not.toBeNull();
      expect(document.querySelector('#view-results .stagewins-block')).not.toBeNull();

      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      let rows = document.querySelectorAll('#view-results table.results tbody tr');
      expect(rows).toHaveLength(10);
      expect(rows[0].querySelector('.rname')?.textContent).toBe('Paul MAGNIER');
      expect(rows[1].querySelector('.rname')?.textContent).toBe('Tobias Lund ANDRESEN');
      expect(document.querySelector('#view-results .stagewins-block')).toBeNull();
      expect(document.querySelector('#view-results .leaflet-container')).toBeNull();

      (document.querySelector('#view-results .expander') as HTMLButtonElement).click();
      rows = document.querySelectorAll('#view-results table.results tbody tr');
      expect(rows).toHaveLength(results.stageResults['1'].rows.length);
      expect(rows[10].querySelector('.rname')?.textContent).toBe('Jasper STUYVEN');

      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(
        document.querySelector('#view-results table.results tbody tr .rname')?.textContent,
      ).toBe('Guillermo SILVA');

      select.value = '21';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.querySelector('#view-results .cls-head .name')?.textContent).toBe(
        'Stage 21 result',
      );
      expect(document.querySelector('#view-results table.results .rname')?.textContent).toBe(
        'Jonathan MILAN',
      );
      (document.querySelector('#langSel [data-lang="fr"]') as HTMLButtonElement).click();
      expect(select.value).toBe('21');
      expect(document.getElementById('tabResults')?.textContent).toBe('Classements');
      expect(select.options[0].textContent).toContain('Classement général');
      (document.querySelector('#langSel [data-lang="fi"]') as HTMLButtonElement).click();
      expect(select.value).toBe('21');
      expect(document.getElementById('tabResults')?.textContent).toBe('Sijoitukset');

      select.value = 'general';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.querySelector('#view-results .clsgrid')).not.toBeNull();
      expect(document.querySelector('#view-results .stagewins-block')).not.toBeNull();
    } finally {
      page.window.close();
    }
  });

  it('shows an unavailable message instead of a placing when a stage has no rows', async () => {
    const page = openPage({ ...results.stageResults, 1: { rows: [] } });
    try {
      const { document, Event } = page.window;
      const select = document.getElementById('rankStageSelect') as HTMLSelectElement;
      await waitFor(() => select.options.length === 22);
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.querySelector('#view-results .empty-cls')?.textContent).toContain(
        'not available',
      );
      expect(document.querySelector('#view-results table.results')).toBeNull();
    } finally {
      page.window.close();
    }
  });
});
