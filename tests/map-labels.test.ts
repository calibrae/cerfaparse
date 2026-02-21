import { describe, it, expect } from 'vitest';
import { mapLabelsToFields } from '../src/map-labels.js';
import type { Label, TransformMatrix, SvgBox } from '../src/types.js';
import type { FieldGroup } from '../src/group-rows.js';

// Identity-ish transform for simplicity
const IDENTITY_MATRIX: TransformMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

const PAGE_HEIGHT = 600;

function makeFieldGroup(
  x: number,
  y: number,
  count: number,
  type: 'cell' | 'checkbox' = 'cell',
): FieldGroup {
  const boxes: SvgBox[] = Array.from({ length: count }, (_, i) => ({
    x: x + i * 10,
    y,
    width: 8,
    height: 10,
    type,
  }));
  return {
    boxes,
    row: { boxes, y, type, page: 1 },
    boxCount: count,
  };
}

function makeLabel(text: string, xMin: number, yMax: number): Label {
  return {
    text,
    xMin,
    yMin: yMax - 10,
    xMax: xMin + 40,
    yMax,
    page: 1,
  };
}

describe('mapLabelsToFields', () => {
  it('maps a label above a field group', () => {
    const groups = [makeFieldGroup(10, 50, 5)];
    const labels = [makeLabel('Nom :', 10, 45)]; // above the field (yMax=45 < row y=50)
    const fields = mapLabelsToFields(groups, labels, IDENTITY_MATRIX, 1, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('p1_nom');
    expect(fields[0].label).toBe('Nom :');
    expect(fields[0].maxLength).toBe(5);
    expect(fields[0].type).toBe('cell');
  });

  it('generates unique names for duplicate labels', () => {
    const groups = [makeFieldGroup(10, 50, 3), makeFieldGroup(10, 80, 3)];
    const labels = [
      makeLabel('Nom :', 10, 45),
      makeLabel('Nom :', 10, 75),
    ];
    const fields = mapLabelsToFields(groups, labels, IDENTITY_MATRIX, 1, PAGE_HEIGHT);

    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('p1_nom');
    expect(fields[1].name).toBe('p1_nom_2');
  });

  it('falls back to positional name when no label matches', () => {
    const groups = [makeFieldGroup(10, 50, 3)];
    const labels: Label[] = []; // no labels at all
    const fields = mapLabelsToFields(groups, labels, IDENTITY_MATRIX, 1, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('p1_field');
    expect(fields[0].label).toBe('');
  });

  it('handles checkbox fields (no maxLength)', () => {
    const groups = [makeFieldGroup(10, 50, 1, 'checkbox')];
    const labels = [makeLabel('Oui', 10, 45)];
    const fields = mapLabelsToFields(groups, labels, IDENTITY_MATRIX, 1, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].type).toBe('checkbox');
    expect(fields[0].maxLength).toBeUndefined();
  });

  it('strips diacritics from field names', () => {
    const groups = [makeFieldGroup(10, 50, 3)];
    const labels = [makeLabel('Prénom :', 10, 45)];
    const fields = mapLabelsToFields(groups, labels, IDENTITY_MATRIX, 1, PAGE_HEIGHT);

    expect(fields[0].name).toBe('p1_prenom');
  });
});
