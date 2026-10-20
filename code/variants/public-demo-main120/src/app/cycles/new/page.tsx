"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]

const STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "active",      label: "Active"      },
  { value: "in_review",   label: "In Review"   },
  { value: "completed",   label: "Completed"   },
  { value: "archived",    label: "Archived"    },
]

type Client = { id: string; name: string }

export default function NewCyclePage() {
  const router = useRouter()

  const [clients,  setClients]  = useState<Client[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState("")

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  const [form, setForm] = useState({
    client_id:   "",
    title:       "",
    workspace:   "",
    month:       MONTHS[new Date().getMonth()],
    year:        String(currentYear),
    start_date:  "",
    end_date:    "",
    description: "",
    status:      "active",
  })

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => {
      setClients(data ?? [])
    })
  }, [])

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) { setError("Title is required."); return }
    if (!form.month)        { setError("Month is required."); return }

    setSaving(true)
    setError("")

    const { data, error: insertErr } = await supabase
      .from("monthly_cycles")
      .insert({
        client_id:   form.client_id   || null,
        title:       form.title.trim(),
        month:       form.month,
        year:        parseInt(form.year),
        start_date:  form.start_date  || null,
        end_date:    form.end_date    || null,
        description: form.description || null,
        status:      form.status,
      })
      .select()
      .single()

    if (insertErr) {
      setError(`Failed to create cycle: ${insertErr.message}`)
      setSaving(false)
      return
    }

    router.push(`/cycles/${data.id}`)
  }

  return (
    <main className="ops-dark jarvis-dark-shell flex min-h-screen text-white">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-2xl">

          <button
            onClick={() => router.back()}
            className="mb-8 text-sm text-gray-500 transition hover:text-gray-300"
          >
            ← Back
          </button>

          <p className="text-sm text-gray-500">Cycles</p>
          <h1 className="mt-2 text-4xl font-bold">New Cycle</h1>
          <p className="mt-2 text-sm text-gray-500">
            Create a monthly campaign container for a client.
          </p>

          <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

              {/* Client */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Client
                </label>
                <select
                  value={form.client_id}
                  onChange={(e) => set("client_id", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
                >
                  <option value="">— No client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. DEMOCLIENTD — May 2026"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                />
              </div>

              {/* Month */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Month *
                </label>
                <select
                  value={form.month}
                  onChange={(e) => set("month", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
                >
                  {MONTHS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Year *
                </label>
                <select
                  value={form.year}
                  onChange={(e) => set("year", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
                >
                  {years.map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>

              {/* Start date */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Start Date
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none [color-scheme:dark]"
                />
              </div>

              {/* End date */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  End Date
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none [color-scheme:dark]"
                />
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 transition focus:border-gray-300 focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Brief overview of this campaign or cycle..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-black px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-gray-300 focus:outline-none"
                />
              </div>

            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                ⚠ {error}
              </div>
            )}

            <div className="mt-8 flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Cycle"}
              </button>
              <button
                onClick={() => router.back()}
                className="rounded-xl border border-gray-300 px-6 py-3 text-sm text-gray-400 transition hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>

        </div>
      </section>
    </main>
  )
}
