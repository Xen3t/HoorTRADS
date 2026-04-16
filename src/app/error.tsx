'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-text-primary mb-2">Une erreur est survenue</h1>
        <p className="text-sm text-text-secondary mb-6">
          {error.message || 'Une erreur inattendue est survenue. Vos données de session sont en sécurité.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2 bg-brand-green text-white font-semibold text-sm rounded-[12px] hover:bg-brand-green-hover transition-colors"
          >
            Réessayer
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="px-5 py-2 bg-surface text-text-primary font-semibold text-sm rounded-[12px] hover:bg-border transition-colors"
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </div>
    </main>
  )
}
