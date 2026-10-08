'use client';
import { useEffect, useRef, useState } from 'react';

type Source = { src: string; type: 'video/mp4' | 'video/webm' };
export type HeroVideoProps = {
  poster: string;
  sources: readonly Source[];
  label: string;
  className?: string;
};
/** Progressive hero: static poster first, opt-in playback on mobile. */
export function HeroVideo({ poster, sources, label, className = '' }: HeroVideoProps) {
  const container = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [optIn, setOptIn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const wide = matchMedia('(min-width: 768px)');
    const update = () => { setReduced(motion.matches); setDesktop(wide.matches); };
    const visibility = () => setHidden(document.hidden);
    update(); visibility();
    motion.addEventListener('change', update); wide.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1));
    }, { threshold: [0, 0.1] });
    if (container.current) observer.observe(container.current);
    return () => {
      observer.disconnect(); motion.removeEventListener('change', update);
      wide.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const eligible = !reduced && !failed && (desktop || optIn);
  const active = eligible && visible && !hidden && !paused;
  useEffect(() => { if (active) setLoaded(true); }, [active]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active) { element.pause(); setPlaying(false); return; }
    let cancelled = false;
    element.muted = true;
    element.play().catch(() => {
      // A viewport/tab pause can cancel an in-flight play promise; it is not a media error.
      if (!cancelled) { setPlaying(false); setFailed(true); }
    });
    return () => { cancelled = true; };
  }, [active, loaded]);
  const toggle = () => {
    if (!optIn && !desktop) { setOptIn(true); setPaused(false); }
    else setPaused(value => !value);
  };
  return <figure ref={container} className={`hero-motion ${className}`}>
    <img className="hero-motion__poster" src={poster} alt="" aria-hidden="true" />
    {eligible && loaded && <video ref={video} className={`hero-motion__video${playing ? ' is-playing' : ''}`}
      muted loop playsInline preload="none" poster={poster} aria-hidden="true"
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}>
      {sources.map(source => <source key={source.src} src={source.src} type={source.type} />)}
    </video>}
    <figcaption className="hero-motion__label">{label}</figcaption>
    {!reduced && !failed && <button className="hero-motion__toggle" type="button" onClick={toggle}
      aria-label={(!desktop && !optIn) || paused ? 'Lire l’animation d’illustration' : 'Mettre l’animation en pause'}>
      {(!desktop && !optIn) || paused ? 'Lire l’animation' : 'Pause'}
    </button>}
  </figure>;
}
