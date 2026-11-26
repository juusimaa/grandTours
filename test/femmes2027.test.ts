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
  throw new Error('Timed out waiting for the Femmes 2027 page');
}

describe('Femmes 2027 page (route only)', () => {
  it('renders stages and empty Results/Teams states when results and riders are missing', async () => {
    const shared = readFileSync(resolve(root, 'dist/race-page.js'), 'utf8');
    const html = readFileSync(resolve(root, '2027/femmes.html'), 'utf8').replace(
      '<script src="../dist/race-page.js"></script>',
      `<script>${shared}</script>`,
    );
    const errors: unknown[] = [];
    const page = new JSDOM(html, {
      url: 'https://example.test/2027/femmes.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.addEventListener('error', (event) => errors.push(event.error ?? event.message));
        // No routes, results or riders yet: every file 404s (dashed start-finish lines).
        (window as any).fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
      },
    });
    try {
      const { document } = page.window;
      await waitFor(() => document.querySelectorAll('#stageList .stage-btn').length === 9);
      await waitFor(() => !!document.querySelector('#teamsGrid .status-card'));
      expect(document.getElementById('panel')?.textContent).toContain('Leeds');
      const stats = [...document.querySelectorAll('#topstats .statcell .value')].map(
        (el) => el.textContent,
      );
      expect(stats).toEqual(['1,156 km', '17,665 m', '9', '0', '2']);
      expect(document.getElementById('finalTag')).toBeNull();
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
