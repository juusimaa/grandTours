import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const routes = JSON.parse(readFileSync(resolve(root, 'data/2027/giro2027-routes.json'), 'utf8'));

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the Giro 2027 page');
}

describe('Giro 2027 page (route only)', () => {
  it('renders stages and empty Results/Teams states when results and riders are missing', async () => {
    const shared = readFileSync(resolve(root, 'dist/race-page.js'), 'utf8');
    const html = readFileSync(resolve(root, '2027/giro.html'), 'utf8').replace(
      '<script src="../dist/race-page.js"></script>',
      `<script>${shared}</script>`,
    );
    const errors: unknown[] = [];
    const page = new JSDOM(html, {
      url: 'https://example.test/2027/giro.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.addEventListener('error', (event) => errors.push(event.error ?? event.message));
        (window as any).fetch = async (url: string) =>
          url === '../data/2027/giro2027-routes.json'
            ? { ok: true, json: async () => routes }
            : { ok: false, status: 404, json: async () => ({}) };
      },
    });
    try {
      const { document } = page.window;
      await waitFor(() => document.querySelectorAll('#stageList .stage-btn').length === 21);
      await waitFor(() => !!document.querySelector('#teamsGrid .status-card'));
      expect(document.getElementById('panel')?.textContent).toContain('Trieste');
      const stats = [...document.querySelectorAll('#topstats .statcell .value')].map(
        (el) => el.textContent,
      );
      expect(stats).toEqual(['3,418.9 km', '50,250 m', '21', '2', '6']);
      expect(document.querySelector('#teamsGrid .status-card')?.textContent).toContain(
        'start list has not been published',
      );
      expect(document.querySelector('#resultsGrid')?.textContent?.trim()).not.toBe('');
      expect(errors).toEqual([]);
    } finally {
      page.window.close();
    }
  });
});
