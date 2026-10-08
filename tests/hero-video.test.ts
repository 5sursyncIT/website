import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroVideo } from '../src/components/HeroVideo';

test('pre-rendered hero ships a poster and no video source or autoplay request before preferences are known', () => {
  const markup = renderToStaticMarkup(createElement(HeroVideo, {
    poster:'/assets/motion/posters/accueil.jpg',
    sources:[{src:'/assets/motion/videos/accueil.mp4',type:'video/mp4'}],
    label:'Illustration — Écosystème numérique',
  }));
  assert.match(markup,/src="\/assets\/motion\/posters\/accueil.jpg"/);
  assert.doesNotMatch(markup,/<video|<source|accueil\.mp4/);
  assert.match(markup,/Illustration — Écosystème numérique/);
  assert.match(markup,/aria-hidden="true"/);
});
