"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import ClientWorkspaceHeader from "@/components/clients/client-workspace-header";
import type { ClientWorkspaceChrome } from "@/lib/client-workspace-chrome-server";
import styles from "./client-suite.module.css";

const workspaceRoute = (pathname: string, clientId: string) => {
  const root = `/clients/${clientId}`;
  return (
    pathname === root ||
    pathname === `${root}/brain` ||
    pathname === `${root}/brain/assets` ||
    pathname === `${root}/planner` ||
    pathname === `${root}/social` ||
    pathname === `${root}/ai-content` ||
    pathname === `${root}/ai-content/studio`
  );
};

export default function ClientWorkspaceShell({
  clientId,
  children,
  initialChrome = null,
}: {
  clientId: string;
  children: ReactNode;
  initialChrome?: ClientWorkspaceChrome | null;
}) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const isWorkspaceRoute = workspaceRoute(pathname, clientId);

  useEffect(() => {
    if (!isWorkspaceRoute || lastPath.current === pathname) return;
    lastPath.current = pathname;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [isWorkspaceRoute, pathname]);

  if (!isWorkspaceRoute) return <>{children}</>;

  return (
    <main className={`${styles.root} client-workspace-shell flex min-h-dvh bg-[#0a0a0b] text-white`}>
      <Sidebar variant="client-workspace" />
      <section className="jarvis-dark-shell min-w-0">
        <div className="client-workspace-canvas jarvis-page py-7 sm:py-9">
          <ClientWorkspaceHeader
            clientId={clientId}
            data={initialChrome}
            loading={!initialChrome}
          />
          {!initialChrome ? (
            <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
              Workspace details are temporarily unavailable. Module data remains
              available.
            </p>
          ) : null}
          <div className="client-workspace-module mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
