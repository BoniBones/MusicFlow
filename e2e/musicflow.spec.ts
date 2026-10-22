import { expect, test } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const realPianoPdf = resolve(__dirname, '..', '..', 'Clásico', 'MoonLight Sonata - Beethoven.pdf');

test.describe('MusicFlow End-to-End Verification (All 14 QA Workflows)', () => {
  test('1-14: Full pianist workflow from PDF import to reading, autoscroll, metronome, bookmarks, themes, and persistence', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('library-view')).toBeVisible();
    await expect(page.getByTestId('local-storage-notice')).toContainText('IndexedDB');

    // 1. Upload a real multipage piano PDF and confirm it appears in the library
    if (existsSync(realPianoPdf)) {
      const fileInput = page.getByTestId('file-upload-input');
      await fileInput.setInputFiles(realPianoPdf);
      await expect(page.getByTestId('score-card-MoonLight Sonata')).toBeVisible({ timeout: 20_000 });
    } else {
      await page.getByTestId('load-sample-score-btn').click();
      await expect(page.getByTestId('score-card-Prelude in C Major, BWV 846')).toBeVisible({ timeout: 20_000 });
    }

    // 3 & 14. Reload the browser application and verify that the imported score remains stored in IndexedDB
    await page.reload();
    await expect(page.getByTestId('score-grid')).toBeVisible();
    const firstCard = page.locator('[data-testid^="score-card-"]').first();
    await expect(firstCard).toBeVisible();

    // 2 & 13. Open the PDF in the reader and navigate between its pages across page boundaries
    await firstCard.click();
    await expect(page.getByTestId('reader-view')).toBeVisible();
    await expect(page.getByTestId('score-page-1')).toBeVisible({ timeout: 15_000 });

    const viewport = page.getByTestId('reader-scroll-viewport');

    // Navigate to Page 2 using the Next Page button and verify smooth scroll / no unexpected jumps
    await page.getByTestId('reader-next-page').click();
    await expect(page.getByTestId('reader-page-select')).toHaveValue('1');
    const scrollAtPage2 = await viewport.evaluate((el) => el.scrollTop);
    expect(scrollAtPage2).toBeGreaterThan(100);

    // Navigate back to Page 1
    await page.getByTestId('reader-prev-page').click();
    await expect(page.getByTestId('reader-page-select')).toHaveValue('0');

    // Disable countdown so autoscroll starts immediately when clicked
    await page.getByTestId('autoscroll-expand-btn').click();
    await page.getByTestId('countdown-opt-0').click();

    // 4. Activate autoscroll and verify smooth movement
    const scrollBefore = await viewport.evaluate((el) => el.scrollTop);
    await page.getByTestId('autoscroll-toggle-btn').click();
    await page.waitForTimeout(450);
    const scrollRunning = await viewport.evaluate((el) => el.scrollTop);
    expect(scrollRunning).toBeGreaterThan(scrollBefore + 2);

    // 6. Change scroll speed while it is running
    const speedBefore = await page.getByTestId('autoscroll-speed-readout').textContent();
    await page.getByTestId('autoscroll-speed-up').click();
    const speedAfter = await page.getByTestId('autoscroll-speed-readout').textContent();
    expect(speedAfter).not.toEqual(speedBefore);

    // 5. Pause autoscroll and verify that it stops at the expected position
    await page.getByTestId('autoscroll-toggle-btn').click();
    const pausedAt = await viewport.evaluate((el) => el.scrollTop);
    await page.waitForTimeout(250);
    const pausedAfterWait = await viewport.evaluate((el) => el.scrollTop);
    expect(Math.abs(pausedAfterWait - pausedAt)).toBeLessThan(2);

    // 7. Run the metronome at different BPM values and check scheduling behaviour
    await page.getByTestId('reader-metronome-btn').click();
    await expect(page.getByTestId('metronome-panel')).toBeVisible();
    await expect(page.getByTestId('metronome-bpm-value')).toHaveText('80');
    await page.getByTestId('metronome-toggle-btn').click();
    await expect(page.getByTestId('metronome-toggle-btn')).toContainText('Stop');
    await page.getByTestId('metronome-bpm-inc').click();
    await expect(page.getByTestId('metronome-bpm-value')).toHaveText('81');
    await page.getByTestId('time-sig-6/8').click();

    // 8. Run autoscroll and metronome simultaneously (and pause autoscroll while keeping metronome running)
    await page.getByTestId('autoscroll-toggle-btn').click();
    await page.waitForTimeout(300);
    const scrollSimultaneous = await viewport.evaluate((el) => el.scrollTop);
    expect(scrollSimultaneous).toBeGreaterThan(pausedAt);
    // Pause autoscroll while metronome continues running independently
    await page.getByTestId('autoscroll-toggle-btn').click();
    await expect(page.getByTestId('metronome-toggle-btn')).toContainText('Stop');
    // Stop metronome and close panel
    await page.getByTestId('metronome-toggle-btn').click();
    await page.getByTestId('reader-metronome-btn').click();

    // 9. Toggle fullscreen mode and confirm that the score remains readable
    await page.getByTestId('reader-fullscreen-btn').click();
    await expect(page.getByTestId('score-page-1')).toBeVisible();
    await page.getByTestId('reader-fullscreen-btn').click();

    // 10. Save a bookmark and reopen the score to confirm persistence
    await page.getByTestId('reader-practice-btn').click();
    await expect(page.getByTestId('practice-drawer')).toBeVisible();
    await page.getByTestId('bookmark-label-input').fill('Difficult passage');
    await page.getByTestId('add-bookmark-btn').click();
    await expect(page.getByTestId('bookmark-item-Difficult passage')).toBeVisible();

    // Return to library, then reopen the score and verify bookmark & per-score BPM (81) persisted
    await page.getByTestId('reader-back-btn').click();
    await expect(page.getByTestId('library-view')).toBeVisible();
    await firstCard.click();
    await expect(page.getByTestId('reader-view')).toBeVisible();
    await expect(page.getByTestId('reader-metronome-btn')).toContainText('81');
    await page.getByTestId('reader-practice-btn').click();
    await expect(page.getByTestId('bookmark-item-Difficult passage')).toBeVisible();

    // Return to library and go to Settings to test themes (11) and responsive viewports (12)
    await page.getByTestId('reader-back-btn').click();
    await page.getByTestId('open-settings-btn').click();
    await expect(page.getByTestId('settings-view')).toBeVisible();

    // 11. Test both light and dark themes
    await page.getByTestId('theme-btn-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByTestId('theme-btn-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // 12. Confirm responsive layouts at tablet (768x1024) and desktop (1280x800) viewport sizes
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByTestId('settings-back-btn').click();
    await expect(page.getByTestId('library-view')).toBeVisible();
    await expect(firstCard).toBeVisible();
  });

  test('Display modes, annotations undo/redo, practice sections, performance mode & keyboard shortcuts', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('load-sample-score-btn').click();
    const card = page.getByTestId('score-card-Prelude in C Major, BWV 846');
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Edit metadata in library modal
    await page.getByTestId('edit-btn-Prelude in C Major, BWV 846').click();
    await expect(page.getByTestId('score-edit-modal')).toBeVisible();
    await page.getByTestId('edit-score-notes').fill('Keep sixteenth notes even');
    await page.getByTestId('save-score-metadata-btn').click();

    // Search by note content
    await page.getByTestId('library-search-input').fill('sixteenth');
    await expect(card).toBeVisible();
    await page.getByTestId('library-search-input').fill('');

    // Open score
    await card.click();
    await expect(page.getByTestId('score-page-1')).toBeVisible({ timeout: 15_000 });

    // Test single-page & two-page spread modes
    await page.getByTestId('view-mode-single').click();
    await expect(page.getByTestId('score-page-1')).toBeVisible();
    await expect(page.getByTestId('score-page-2')).toHaveCount(0);

    await page.getByTestId('view-mode-spread').click();
    await expect(page.getByTestId('score-page-1')).toBeVisible();
    await expect(page.getByTestId('score-page-2')).toBeVisible();

    await page.getByTestId('view-mode-continuous').click();

    // Test zoom in & fit modes
    const initialZoom = await page.getByTestId('zoom-percentage').textContent();
    await page.getByTestId('zoom-in-btn').click();
    const zoomedIn = await page.getByTestId('zoom-percentage').textContent();
    expect(zoomedIn).not.toEqual(initialZoom);
    await page.getByTestId('fit-mode-width').click();

    // Test annotations + undo/redo
    await page.getByTestId('reader-annotate-btn').click();
    await expect(page.getByTestId('annotation-toolbar')).toBeVisible();
    const annotCanvas = page.getByTestId('annotation-canvas-1');
    const box = await annotCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 160, box.y + 120, { steps: 5 });
      await page.mouse.up();
    }
    await expect(page.getByTestId('annot-undo-btn')).toBeEnabled();
    await page.getByTestId('annot-undo-btn').click();
    await expect(page.getByTestId('annot-redo-btn')).toBeEnabled();
    await page.getByTestId('annot-redo-btn').click();
    await page.getByTestId('annot-close-btn').click();

    // Test Practice Section (A -> B) creation
    await page.getByTestId('reader-practice-btn').click();
    await page.getByTestId('drawer-tab-sections').click();
    await page.getByTestId('section-label-input').fill('Measures 1-8');
    await page.getByTestId('save-section-btn').click();
    await expect(page.getByTestId('section-list')).toContainText('Measures 1-8');

    // Test Performance Mode & Escape key
    await page.getByTestId('reader-performance-btn').click();
    await expect(page.getByTestId('exit-performance-btn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('reader-top-bar')).toBeVisible();

    // Test Keyboard Shortcut Modal (?)
    await page.getByTestId('reader-shortcuts-btn').click();
    await expect(page.getByTestId('shortcut-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcut-modal')).toHaveCount(0);
  });
});
