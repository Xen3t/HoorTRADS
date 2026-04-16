'use client'

interface ScoreBadgeProps {
  score: number  // 0-5
  size?: 'sm' | 'md'
}

function getColor(score: number): { stroke: string; text: string; bg: string } {
  if (score >= 4) return { stroke: '#22c55e', text: '#16a34a', bg: '#f0fdf4' }
  if (score >= 3) return { stroke: '#f59e0b', text: '#d97706', bg: '#fffbeb' }
  return { stroke: '#ef4444', text: '#dc2626', bg: '#fef2f2' }
}

export default function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const dim = size === 'sm' ? 36 : 52
  const strokeWidth = size === 'sm' ? 3 : 4
  const radius = (dim - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 5)
  const { stroke, text, bg } = getColor(score)
  const fontSize = size === 'sm' ? 9 : 13

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={{ display: 'block' }}>
      {/* Background circle */}
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={radius}
        fill={bg}
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      {/* Score arc */}
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
      />
      {/* Score text */}
      <text
        x={dim / 2}
        y={dim / 2 + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={text}
        fontFamily="system-ui, sans-serif"
      >
        {score}/5
      </text>
    </svg>
  )
}
