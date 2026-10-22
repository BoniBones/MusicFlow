import { beforeEach, describe, expect, it } from 'vitest';
import { computeLayout, offsetToPosition, positionToOffset, spreadsFor } from '../reader/layout';
import {
  measureToOffset,
  offsetToMeasure,
  pixelsPerSecond,
  secondsPerPageToSlider,
  sliderToSecondsPerPage,
  stepSpeed,
  toTimingPoints,
  validateMarkers,
} from '../reader/timing';
import { db } from '../services/db';
import {
  addBookmark,
  addSection,
  getPrefs,
  listBookmarks,
  loadAnnotations,
  savePageAnnotations,
  savePrefs,
} from '../services/practiceRepo';
import { eventToCombo, findAction, formatCombo } from '../shortcuts/keys';
import { DEFAULT_SHORTCUTS } from '../settings/defaults';

describe('Reader layout & zoom-independent coordinate conversion', () => {
  const sizes = [
    { width: 600, height: 800 },
    { width: 600, height: 800 },
    { width: 600, height: 800 },
  ];

  it('preserves aspect ratio in continuous, single-page, and two-page spread modes', () => {
    const cont = computeLayout({
      sizes,
      viewMode: 'continuous',
      fitMode: 'width',
      zoom: 1,
      containerWidth: 1000,
      containerHeight: 900,
      padding: 20,
      gap: 16,
    });
    expect(cont.pages.length).toBe(3);
    for (const p of cont.pages) {
      expect(p.height / p.width).toBeCloseTo(800 / 600, 5);
    }

    const spreads = spreadsFor(3, 'spread');
    expect(spreads).toEqual([[0, 1], [2]]);
    const spreadLayout = computeLayout(
      {
        sizes,
        viewMode: 'spread',
        fitMode: 'page',
        zoom: 1,
        containerWidth: 1400,
        containerHeight: 900,
        padding: 20,
        gap: 16,
      },
      spreads[0],
    );
    expect(spreadLayout.pages.length).toBe(2);
    expect(spreadLayout.pages[1].left).toBeGreaterThan(spreadLayout.pages[0].left + spreadLayout.pages[0].width);
  });

  it('round-trips score positions across different zoom levels', () => {
    const layout1 = computeLayout({
      sizes,
      viewMode: 'continuous',
      fitMode: 'custom',
      zoom: 1,
      containerWidth: 1000,
      containerHeight: 900,
      padding: 20,
      gap: 16,
    });
    const layout2 = computeLayout({
      sizes,
      viewMode: 'continuous',
      fitMode: 'custom',
      zoom: 1.75,
      containerWidth: 1000,
      containerHeight: 900,
      padding: 20,
      gap: 16,
    });

    const target = { page: 1, y: 0.42 };
    const off1 = positionToOffset(target, layout1);
    const off2 = positionToOffset(target, layout2);
    expect(offsetToPosition(off1, layout1).page).toBe(1);
    expect(offsetToPosition(off1, layout1).y).toBeCloseTo(0.42, 4);
    expect(offsetToPosition(off2, layout2).page).toBe(1);
    expect(offsetToPosition(off2, layout2).y).toBeCloseTo(0.42, 4);
  });
});

describe('Autoscroll speed & musical timing calibration', () => {
  it('converts slider positions and steps speed smoothly', () => {
    const slider = secondsPerPageToSlider(60);
    expect(sliderToSecondsPerPage(slider)).toBeCloseTo(60, 3);
    expect(stepSpeed(60, 1)).toBeLessThan(60);
    expect(stepSpeed(60, -1)).toBeGreaterThan(60);
    expect(pixelsPerSecond(1200, 60)).toBe(20);
  });

  it('interpolates between calibrated bar markers accurately', () => {
    const markers = [
      { id: '1', position: { page: 0, y: 0.1 }, measure: 1 },
      { id: '2', position: { page: 0, y: 0.6 }, measure: 9 },
    ];
    expect(validateMarkers(markers)).toBeNull();
    const pts = toTimingPoints(markers, (p) => p.y * 1000);
    expect(measureToOffset(pts, 5)).toBeCloseTo(350, 4);
    expect(offsetToMeasure(pts, 350)).toBeCloseTo(5, 4);
  });
});

describe('Per-piece preferences, bookmarks, sections & annotations', () => {
  beforeEach(async () => {
    await Promise.all([db.prefs.clear(), db.bookmarks.clear(), db.sections.clear(), db.annotations.clear()]);
  });

  it('persists bookmarks, sections, annotations, and per-score preferences', async () => {
    const scoreId = 'test-score';
    await savePrefs(scoreId, { zoom: 1.35, lastPosition: { page: 2, y: 0.25 } });
    await savePrefs(scoreId, { metronome: { bpm: 96 } });
    const prefs = await getPrefs(scoreId);
    expect(prefs?.zoom).toBe(1.35);
    expect(prefs?.lastPosition).toEqual({ page: 2, y: 0.25 });
    expect(prefs?.metronome?.bpm).toBe(96);

    await addBookmark(scoreId, { page: 2, y: 0.5 }, 'Coda');
    await addBookmark(scoreId, { page: 0, y: 0.8 }, 'Exposition');
    const bms = await listBookmarks(scoreId);
    expect(bms.map((b) => b.label)).toEqual(['Exposition', 'Coda']);

    const sec = await addSection(scoreId, { page: 1, y: 0.8 }, { page: 1, y: 0.2 }, 'Reversed inputs');
    expect(sec.start.y).toBe(0.2);
    expect(sec.end.y).toBe(0.8);

    await savePageAnnotations(scoreId, 0, [
      { id: 's1', type: 'pen', color: '#dc2626', width: 0.003, points: [0.1, 0.2, 0.3, 0.4] },
    ]);
    const map = await loadAnnotations(scoreId);
    expect(map.get(0)?.length).toBe(1);
  });
});

describe('Keyboard shortcut mapping', () => {
  it('maps events to actions and formats combos cleanly', () => {
    const spaceCombo = eventToCombo({ key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    expect(spaceCombo).toBe('Space');
    expect(findAction(spaceCombo, DEFAULT_SHORTCUTS)).toBe('toggleAutoscroll');
    expect(findAction('m', DEFAULT_SHORTCUTS)).toBe('toggleMetronome');
    expect(findAction('+', DEFAULT_SHORTCUTS)).toBe('speedUp');
    expect(formatCombo('ArrowRight')).toBe('→');
    expect(formatCombo('+')).toBe('+');
  });
});
