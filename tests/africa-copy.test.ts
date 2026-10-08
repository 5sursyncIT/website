import test from 'node:test';
import assert from 'node:assert/strict';
import { Pages } from '../src/collections';
import type { ArrayField, TextareaField } from 'payload';
const copy = Pages.fields.find(field => 'name' in field && field.name === 'copy') as ArrayField;
const field = copy.fields.find(field => 'name' in field && field.name === 'value') as TextareaField;
const validate = field.validate as unknown as (value: unknown, options: { siblingData: { key: string } }) => boolean | string;
test('only the six approved country missions may be cleared; ordinary page copy stays required', () => {
  for (const id of ['SEN','CIV','GIN','GNB','COD','COG']) {
    for (const value of ['', null, undefined]) assert.equal(validate(value, { siblingData: { key: 'africa-mission-' + id } }), true);
  }
  for (const key of ['text-0','africa-title','africa-intro','africa-mission-XXX']) {
    assert.notEqual(validate('', { siblingData: { key } }), true);
    assert.equal(validate('Texte conservé', { siblingData: { key } }), true);
  }
});

test('blank missions remain invisible while older CMS clients can retain them when saving other page copy', () => {
  const normalize = Pages.hooks!.beforeValidate![0] as unknown as (args: { data: { copy: { key: string; value?: string | null }[] } }) => { copy: { key: string; value?: string | null }[] };
  const data = { copy: [{ key: 'africa-mission-SEN', value: '' }, { key: 'africa-mission-COD', value: null }, { key: 'text-0', value: 'Texte intact' }] };
  const result = normalize({ data });
  for (const row of result.copy.slice(0, 2)) { assert.ok(row.value); assert.equal(row.value!.trim(), ''); }
  assert.equal(result.copy[2].value, 'Texte intact');
  assert.notEqual(validate({ invalid: true }, { siblingData: { key: 'africa-mission-SEN' } }), true);
});
