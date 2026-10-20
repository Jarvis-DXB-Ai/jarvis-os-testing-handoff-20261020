"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function ClientForm() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [status, setStatus] = useState("active")
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage("")

    const { error } = await supabase.from("clients").insert({
      name,
      industry,
      status,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    router.push("/clients")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="jarvis-panel mt-8 max-w-2xl p-6">
      <div className="space-y-5">
        <div>
          <label className="text-sm text-white/55">Client name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="DemoClientD Dubai"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/50"
          />
        </div>

        <div>
          <label className="text-sm text-white/55">Industry</label>
          <input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Hospitality, Real Estate, Yachting..."
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/50"
          />
        </div>

        <div>
          <label className="text-sm text-white/55">Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition focus:border-emerald-300/50"
          >
            <option value="active">Active</option>
            <option value="lead">Lead</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {errorMessage ? (
          <p className="text-sm text-red-400">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="jarvis-button disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Create client"}
        </button>
      </div>
    </form>
  )
}
