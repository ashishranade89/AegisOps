import { useEffect } from 'react'
import type { IncidentPhase, TimelineEvent } from '@/stores/incident-store'
import { useIncidentStore } from '@/stores/incident-store'

export function useSSE(runId: string | null) {
  const { addEvent, setPhase, setReport, setStatus, recordCost, setBrowserResult, setApprovalContext } = useIncidentStore()

  useEffect(() => {
    if (!runId) return

    // SSE Stream URL
    const apiKey = localStorage.getItem('incident_api_key')
    const streamUrl = apiKey
      ? `/api/incident/${runId}/stream?api_key=${encodeURIComponent(apiKey)}`
      : `/api/incident/${runId}/stream`
    const es = new EventSource(streamUrl)

    const handle = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>
        if (type === 'phase_change' && typeof data.phase === 'string') {
          setPhase(data.phase as IncidentPhase)
        }
        if (type === 'report' && typeof data.content === 'string') {
          setReport(data.content)
        }
        if (type === 'cost_update' && data.agent_name) {
          recordCost(data as any)
          return // don't add cost_update to the visible event feed
        }
        if (type === 'browser_result') {
          setBrowserResult(data as any)
          return // store separately, not in the event feed
        }
        if (type === 'approval_context') {
          setApprovalContext(data as any)
          return // store separately
        }
        addEvent({ type, ...data, timestamp: Date.now() } as TimelineEvent)
      } catch (err) {
        console.error("Failed to parse SSE line data:", err)
      }
    }

    const eventNames = [
      'phase_change',
      'agent_start',
      'agent_end',
      'tool_start',
      'tool_end',
      'handoff',
      'report',
      'error',
      'cost_update',
      'browser_result',
      'approval_context',
    ]

    for (const evt of eventNames) {
      es.addEventListener(evt, handle(evt))
    }

    es.addEventListener('done', () => {
      setStatus('completed')
      setPhase('completed')
      addEvent({ type: 'done', timestamp: Date.now() })
      es.close()
    })

    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) return
      setStatus('failed')
      es.close()
    })

    return () => {
      es.close()
    }
  }, [runId, addEvent, setPhase, setReport, setStatus, setBrowserResult, setApprovalContext])
}
