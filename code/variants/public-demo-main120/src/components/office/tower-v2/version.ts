'use client';
import { useEffect, useState } from 'react';
export type SceneVersion = 'v2' | 'legacy';
export function readSceneVersion(): SceneVersion { return new URLSearchParams(window.location.search).get('officeScene') === 'legacy' ? 'legacy' : 'v2'; }
export function chooseSceneVersion(version: SceneVersion) { const url = new URL(window.location.href); url.searchParams.set('officeScene', version); window.history.replaceState(null, '', url); window.dispatchEvent(new Event('office-scene-version')); }
export function useSceneVersion() { const [version, setVersion] = useState<SceneVersion>('v2'), [known, setKnown] = useState(false); useEffect(() => { const sync = () => { setVersion(readSceneVersion()); setKnown(true); }; sync(); window.addEventListener('popstate', sync); window.addEventListener('office-scene-version', sync); return () => { window.removeEventListener('popstate', sync); window.removeEventListener('office-scene-version', sync); }; }, []); return { version, known, choose: chooseSceneVersion }; }
