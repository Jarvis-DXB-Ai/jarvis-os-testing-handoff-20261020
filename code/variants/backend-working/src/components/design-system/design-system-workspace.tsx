'use client';
import { useEffect, useRef } from 'react';
import { DesignSystemSpecimens } from './design-system-specimens';
import { mountDesignGuide } from './design-system-interactions';
import styles from './design-system-r02.module.css';
export function DesignSystemWorkspace() {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => root.current ? mountDesignGuide(root.current) : undefined, []);
    return <main ref={root} className={styles.root} data-design-library><DesignSystemSpecimens /></main>;
}
