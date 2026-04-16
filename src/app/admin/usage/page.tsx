'use client'

import { motion } from 'framer-motion'

export default function AdminUsagePage() {
  // In V2: fetch real usage data from API
  const mockStats = {
    totalGenerations: 0,
    totalCost: 0,
    thisMonth: 0,
    thisMonthCost: 0,
  }

  return (
    <main className="min-h-screen px-8 pt-12 pb-12">
      <div className="max-w-[600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Utilisation API</h1>
            <p className="text-sm text-text-secondary">Suivre les coûts de génération</p>
          </div>
          <a href="/admin" className="text-sm text-brand-teal hover:text-brand-teal-hover">← Admin</a>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: 'Total générations', value: mockStats.totalGenerations.toString(), sub: 'depuis le début' },
            { label: 'Coût total', value: `$${mockStats.totalCost.toFixed(2)}`, sub: 'estimé' },
            { label: 'Ce mois-ci', value: mockStats.thisMonth.toString(), sub: 'images' },
            { label: 'Coût mensuel', value: `$${mockStats.thisMonthCost.toFixed(2)}`, sub: 'estimé' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-[12px] shadow-sm p-4"
            >
              <p className="text-xs text-text-secondary">{stat.label}</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{stat.value}</p>
              <p className="text-[10px] text-text-disabled">{stat.sub}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[12px] shadow-sm p-5"
        >
          <p className="text-sm font-semibold text-text-secondary mb-3">Référence tarifaire</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-secondary">Résolution</th>
                <th className="text-right py-2 text-text-secondary">Standard</th>
                <th className="text-right py-2 text-text-secondary">Batch (-50%)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2">1K (1024px)</td>
                <td className="text-right py-2">$0.067</td>
                <td className="text-right py-2">$0.034</td>
              </tr>
              <tr>
                <td className="py-2">2K (2048px)</td>
                <td className="text-right py-2">$0.101</td>
                <td className="text-right py-2">$0.051</td>
              </tr>
            </tbody>
          </table>
        </motion.div>
      </div>
    </main>
  )
}
