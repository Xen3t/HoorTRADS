'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'graphiste'
  created_at: string
  is_suspended: number
}

interface EditForm {
  name: string
  email: string
  password: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'graphiste' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', password: '' })
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.name || !form.password) return
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowAdd(false)
        setForm({ email: '', name: '', password: '', role: 'graphiste' })
        load()
      } else {
        const d = await res.json()
        setFormError(d.error || 'Erreur')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (userId: string, role: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    load()
  }

  const handleDelete = async (userId: string) => {
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setDeleteConfirm(null)
    load()
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({ name: user.name, email: user.email, password: '' })
    setEditError('')
  }

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditSaving(true)
    setEditError('')
    try {
      const body: Record<string, string> = { userId: editingUser.id, name: editForm.name, email: editForm.email }
      if (editForm.password) body.password = editForm.password
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setEditingUser(null)
        load()
      } else {
        const d = await res.json()
        setEditError(d.error || 'Erreur')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const handleSuspend = async (user: User) => {
    const suspend = !user.is_suspended
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, suspend }),
    })
    load()
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Gestion des utilisateurs</h1>
            <p className="text-sm text-text-secondary">Comptes et rôles</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 rounded-[10px] bg-brand-green text-white text-sm font-bold hover:bg-brand-green-hover transition-colors"
            >
              + Ajouter
            </button>
            <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
          </div>
        </div>

        {/* Add user form */}
        <AnimatePresence>
          {showAdd && (
            <motion.form
              onSubmit={handleAdd}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-white border border-border rounded-[16px] p-5 mb-4 space-y-3"
            >
              <p className="text-sm font-semibold text-text-primary mb-1">Nouvel utilisateur</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Nom</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Prénom Nom"
                    required
                    className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@exemple.com"
                    required
                    className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Mot de passe</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min. 8 caractères"
                    required
                    className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">Rôle</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                  >
                    <option value="graphiste">Graphiste</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {formError && <p className="text-xs text-brand-red">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 rounded-[8px] border border-border text-sm text-text-secondary hover:bg-surface transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded-[8px] bg-brand-green text-white text-sm font-semibold hover:bg-brand-green-hover transition-colors disabled:opacity-60"
                >
                  {saving ? 'Création...' : 'Créer'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Users list */}
        {loading ? (
          <p className="text-center text-sm text-text-secondary py-8">Chargement...</p>
        ) : (
          <div className="bg-white rounded-[16px] border border-border overflow-hidden">
            {users.length === 0 ? (
              <p className="text-center text-sm text-text-disabled py-10">Aucun utilisateur</p>
            ) : (
              <div className="divide-y divide-border">
                {users.map((user) => (
                  <div key={user.id} className={`flex items-center gap-3 px-5 py-3.5 hover:bg-surface ${user.is_suspended ? 'opacity-60' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${user.is_suspended ? 'bg-gray-200' : 'bg-brand-green/10'}`}>
                      <span className={`font-bold text-sm ${user.is_suspended ? 'text-text-disabled' : 'text-brand-green'}`}>
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary truncate">{user.name}</p>
                        {user.is_suspended === 1 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">Suspendu</span>
                        )}
                      </div>
                      <p className="text-xs text-text-disabled truncate">{user.email}</p>
                    </div>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded-[6px] border border-border bg-surface focus:outline-none focus:border-brand-teal"
                    >
                      <option value="graphiste">Graphiste</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => openEdit(user)}
                      className="text-xs px-2 py-1 rounded-[6px] border border-border text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                      title="Modifier"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleSuspend(user)}
                      className={`text-xs px-2 py-1 rounded-[6px] border transition-colors ${
                        user.is_suspended
                          ? 'border-brand-green text-brand-green hover:bg-brand-green/10'
                          : 'border-amber-400 text-amber-600 hover:bg-amber-50'
                      }`}
                      title={user.is_suspended ? 'Réactiver' : 'Suspendre'}
                    >
                      {user.is_suspended ? 'Réactiver' : 'Suspendre'}
                    </button>
                    {deleteConfirm === user.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-[10px] text-white bg-brand-red px-2 py-1 rounded-[6px] font-bold"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-[10px] text-text-secondary px-2 py-1 rounded-[6px] border border-border"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(user.id)}
                        className="text-text-disabled hover:text-brand-red transition-colors text-sm"
                        title="Supprimer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit user modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null) }}
          >
            <motion.form
              onSubmit={handleEditSave}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="bg-white rounded-[16px] border border-border p-6 w-full max-w-[420px] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <p className="text-base font-bold text-text-primary">Modifier l&apos;utilisateur</p>
                <p className="text-xs text-text-secondary mt-0.5">Laissez le mot de passe vide pour ne pas le changer.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Nom</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Laisser vide pour ne pas modifier"
                  className="w-full px-3 py-2 rounded-[8px] text-sm border border-border bg-surface focus:outline-none focus:border-brand-green"
                />
              </div>
              {editError && <p className="text-xs text-brand-red">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2 rounded-[8px] border border-border text-sm text-text-secondary hover:bg-surface transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 py-2 rounded-[8px] bg-brand-green text-white text-sm font-semibold hover:bg-brand-green-hover transition-colors disabled:opacity-60"
                >
                  {editSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
