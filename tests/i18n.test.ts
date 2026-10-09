import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../src/content/defaults.json';
import catalogue from '../src/content/catalogue.json';
import projects from '../src/content/projects.json';
import historicalCases from '../src/content/historical-cases.json';
import { caseStudySeeds } from '../src/lib/showcase';
import { hasTranslation, tr, translateTexts } from '../src/lib/i18n';
import { localeOf, localePath, switchPath } from '../src/lib/locale';
import { publicPaths } from '../src/lib/site-meta';

// Contact coordinates are data, shown as entered in both languages.
const untranslated = new Set(['text-8', 'text-9', 'phone', 'phone-landline', 'phone-mobile']);

test('every shipped French text has an English translation', () => {
  const missing: string[] = [];
  const check = (text: string) => { if (!hasTranslation(text)) missing.push(text); };
  for (const page of defaults) {
    check(page.title);
    for (const { key, value } of page.texts) if (!(page.slug === 'contact' && untranslated.has(key))) check(value);
  }
  for (const p of catalogue) [p.name, p.category, p.summary].forEach(check);
  for (const p of projects) [p.country, p.domain, p.status].forEach(check);
  for (const c of [...caseStudySeeds, ...historicalCases]) [c.category, c.client, c.project, c.summary, ...c.tags].forEach(check);
  assert.deepEqual(missing, []);
});

test('translation keeps CMS fragment spacing, tolerates typographic variants and never touches French', () => {
  assert.equal(tr('en', ' de votre activité.'), ' of your business.');
  assert.equal(tr('en', 'Faut-il tout remplacer ?'), 'Do we need to replace everything?');
  assert.equal(tr('en', 'Faut-il tout remplacer ?'), 'Do we need to replace everything?');
  assert.equal(tr('en', "Fil d'Ariane"), 'Breadcrumb');
  assert.equal(tr('fr', ' de votre activité.'), ' de votre activité.');
  // An edited French text without a translation stays visible as is, never an old translation.
  assert.equal(tr('en', 'Nouveau texte saisi dans le CMS.'), 'Nouveau texte saisi dans le CMS.');
  assert.deepEqual(translateTexts('en', { a: 'Réalisé', b: '+221 77 097 29 08' }), { a: 'Completed', b: '+221 77 097 29 08' });
});

test('every public page has an English address and the language switch is reversible', () => {
  const english = publicPaths.map(path => localePath('en', path));
  assert.equal(new Set(english).size, publicPaths.length);
  for (const [i, path] of publicPaths.entries()) {
    assert.ok(english[i] === '/en' || english[i].startsWith('/en/'), english[i]);
    assert.equal(localeOf(english[i]), 'en');
    assert.equal(localeOf(path), 'fr');
    assert.equal(switchPath(path), english[i]);
    assert.equal(switchPath(english[i]), path);
  }
  assert.equal(localePath('en', '/realisations#groupe-hage'), '/en/projects#groupe-hage');
  assert.equal(localePath('fr', '/realisations#groupe-hage'), '/realisations#groupe-hage');
  // The client Support area exists only in French.
  assert.equal(localePath('en', '/support/connexion'), '/support/connexion');
  assert.equal(switchPath('/support/tickets'), '/en');
  assert.equal(localeOf('/english'), 'fr');
});
