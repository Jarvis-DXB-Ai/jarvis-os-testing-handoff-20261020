"use client"

import Link from "next/link"
import Sidebar from "@/components/layout/sidebar"
import ClientForm from "@/components/forms/client-form"

export default function NewClientPage() {
  return (
    <main className="jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="jarvis-page flex-1">
        <Link href="/clients" className="jarvis-muted-button mb-6 inline-flex px-3 py-2 text-xs">
          ← Back to clients
        </Link>

        <div className="jarvis-hero">
          <p className="jarvis-eyebrow">Client Database</p>
          <h1 className="jarvis-title mt-3">New Client</h1>
          <p className="jarvis-copy mt-4 max-w-2xl">
            Add a new brand or client into the Jarvis operating system.
          </p>
        </div>

        <ClientForm />
      </section>
    </main>
  )
}
