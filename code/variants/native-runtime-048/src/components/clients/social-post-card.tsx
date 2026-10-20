'use client';
import { useState } from 'react';
import styles from './client-suite.module.css';
export const formatMetric=(value:number|null|undefined)=>value==null?'—':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);
export function PostPreview({src}:{src:string|null}) {const [failed,setFailed]=useState<string|null>(null);return <div className={styles.preview}>{src&&failed!==src? /* eslint-disable-next-line @next/next/no-img-element -- Private thumbnail only. */
<img src={src} alt="Post preview" loading="lazy" decoding="async" onError={()=>setFailed(src)}/>:<span>No preview</span>}</div>;}
const icons={likes:<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,comments:<path d="M21 11.5a9 9 0 0 1-9.5 9L3 22l1.5-6.5A9 9 0 1 1 21 11.5Z"/>,shares:<><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,saves:<path d="M5 3h14v19l-7-5-7 5Z"/>};
export function SocialPostStats({post}:{post:Partial<Record<keyof typeof icons,number|null>>}) {return <div className={styles.iconStats}>{(Object.keys(icons) as Array<keyof typeof icons>).map(key=><span key={key} title={`${key}: ${post[key]??'Not provided'}`} aria-label={`${key}: ${post[key]??'Not provided'}`}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[key]}</svg>{formatMetric(post[key])}</span>)}</div>;}
