'use client'

import { motion } from 'framer-motion'
import { getAllCountries } from '@/lib/countries/country-resolver'

export default function AdminCountriesPage() {
  const countries = getAllCountries()

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Pays & Langues</h1>
            <p className="text-sm text-text-secondary">{countries.length} marchés configurés</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        <div className="bg-white rounded-[12px] shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-text-secondary font-semibold">Drapeau</th>
                <th className="text-left px-4 py-3 text-text-secondary font-semibold">Code</th>
                <th className="text-left px-4 py-3 text-text-secondary font-semibold">Nom</th>
                <th className="text-left px-4 py-3 text-text-secondary font-semibold">Langues</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((country, i) => (
                <motion.tr
                  key={country.code}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border last:border-0 hover:bg-surface transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className={`fi fi-${country.code.toLowerCase()}`} style={{ fontSize: '16px' }} />
                  </td>
                  <td className="px-4 py-3 font-semibold">{country.code}</td>
                  <td className="px-4 py-3 text-text-primary">{country.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{country.languages.join(', ')}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-text-disabled mt-4 text-center">
          Pour ajouter ou modifier des pays, mettez à jour la configuration dans l&apos;API admin (fonctionnalité V2)
        </p>
      </div>
    </main>
  )
}
