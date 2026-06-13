import type { ScenarioInfo } from '@/lib/api'
import { Server, Play, ShieldAlert } from 'lucide-react'

interface ScenarioPickerProps {
  scenarios: ScenarioInfo[]
  selected: string
  onSelect: (key: string) => void
  onStart: () => void
  loading: boolean
}

export function ScenarioPicker({
  scenarios,
  selected,
  onSelect,
  onStart,
  loading,
}: ScenarioPickerProps) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card-head" style={{ marginBottom: 4 }}>
        <div>
          <div className="card-title">Telemetry Scenarios</div>
          <div className="card-sub">Trigger simulated vendor anomalies</div>
        </div>
        <Server size={16} className="muted" />
      </div>

      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 10, 
          maxHeight: '380px', 
          overflowY: 'auto',
          paddingRight: '4px'
        }}
        className="custom-scrollbar"
      >
        {scenarios.map((scenario) => {
          const isSelected = selected === scenario.scenario_type
          const typeLabel = scenario.scenario_type.split('_')[0]
          
          return (
            <button
              key={scenario.scenario_type}
              type="button"
              onClick={() => onSelect(scenario.scenario_type)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '12px 14px',
                borderRadius: '8px',
                textAlign: 'left',
                border: '1px solid var(--line)',
                background: isSelected ? 'var(--surface-2)' : 'var(--surface)',
                boxShadow: isSelected ? 'inset 0 0 0 1px var(--primary-accent)' : 'none',
                transition: 'all 150ms ease',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span 
                  style={{ 
                    fontWeight: 600, 
                    fontSize: '13.5px',
                    color: isSelected ? 'var(--primary-accent)' : 'var(--ink)'
                  }}
                >
                  {scenario.name}
                </span>
                <span className="tag" style={{ fontSize: '9.5px', padding: '1px 6px' }}>
                  {typeLabel.toUpperCase()}
                </span>
              </div>
              
              <p 
                className="muted" 
                style={{ 
                  margin: 0, 
                  fontSize: '12px', 
                  lineHeight: '1.4',
                  color: isSelected ? 'var(--ink-2)' : 'var(--ink-3)'
                }}
              >
                {scenario.description}
              </p>
            </button>
          )
        })}
        
        {scenarios.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 10px', color: 'var(--ink-4)' }}>
            <ShieldAlert size={20} />
            <div style={{ fontSize: '12.5px' }}>No simulated scenarios available.</div>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!selected || loading}
        onClick={onStart}
        className="btn primary"
        style={{ 
          marginTop: '6px',
          padding: '10px',
          fontWeight: 600,
          background: selected && !loading ? 'var(--primary-accent)' : undefined,
          color: selected && !loading ? '#000' : undefined,
          borderColor: selected && !loading ? 'var(--primary-accent)' : undefined,
        }}
      >
        <Play size={13} fill="currentColor" />
        <span>{loading ? 'Booting Graph Agents...' : 'Trigger Investigation'}</span>
      </button>
    </div>
  )
}
