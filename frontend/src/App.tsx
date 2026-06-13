import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, Link, useLocation } from 'react-router-dom'
import { HomePage } from '@/pages/home'
import { RunPage } from '@/pages/run'
import { SourcesPage } from '@/pages/sources'
import { useIncidentStore } from '@/stores/incident-store'
import {
  Play,
  Activity,
  Moon,
  Sun,
  PanelRight,
  Shield,
  ShieldCheck,
  BookOpen,
  ServerCog,
} from 'lucide-react'

function Sidebar() {
  const location = useLocation()
  const runId = useIncidentStore((s) => s.runId)
  
  const navItems: { path: string; label: string; icon: typeof Play }[] = [
    { path: '/', label: 'Trigger Simulation', icon: Play },
    { path: '/history', label: 'History & Knowledge', icon: BookOpen },
    { path: '/sources', label: 'Log Sources', icon: ServerCog },
  ]

  if (runId) {
    navItems.splice(1, 0, {
      path: `/run/${runId}`,
      label: 'Active Incident',
      icon: Activity,
    })
  }

  return (
    <aside className="sidebar">
      <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563EB, #F43F5E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Shield size={16} color="#fff" />
        </div>
        <div>
          <div className="brand-name">AegisOps</div>
          <div className="brand-sub">Autonomous Incident Orchestrator</div>
        </div>
      </Link>

      <div className="nav-section-label">Observatory</div>
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = location.pathname === item.path
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="nav-icon" />
            <span>{item.label}</span>
          </Link>
        )}
      )}

      <div className="user-card">
        <div className="avatar">JB</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">Admin</div>
          <div className="user-meta">
            <ShieldCheck size={10} style={{ color: 'var(--positive)' }} /> Secure Session
          </div>
        </div>
      </div>
    </aside>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { chatOpen, setChatOpen } = useIncidentStore()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  const getBreadcrumbs = () => {
    if (location.pathname === '/') {
      return { crumb: 'Incident Room', title: 'Simulate Outage' }
    }
    if (location.pathname.startsWith('/run/')) {
      return { crumb: 'Incident Room', title: 'Active session' }
    }
    if (location.pathname === '/history') {
      return { crumb: 'Incident Room', title: 'History & Knowledge Base' }
    }
    if (location.pathname === '/sources') {
      return { crumb: 'Configuration', title: 'Log Sources' }
    }
    return { crumb: 'Incident Room', title: 'Dashboard' }
  }

  const { crumb, title } = getBreadcrumbs()
  const isUnified = location.pathname === '/' || location.pathname === '/history'

  return (
    <div className={`app ${isUnified ? 'no-sidebar' : ''}`} data-chat={location.pathname.startsWith('/run/') && chatOpen ? 'open' : 'closed'}>
      {!isUnified && <Sidebar />}
      
      <main className="main" style={isUnified ? { padding: 0 } : undefined}>
        {!isUnified && (
          <header className="topbar">
            <span className="topbar-title">
              <span className="muted">{crumb}</span>
              <span className="muted" style={{ margin: '0 8px' }}>/</span>
              <strong>{title}</strong>
            </span>
            <div className="topbar-spacer" />
            <span className="topbar-pill">
              <span className="dot" /> Local Observatory Active
            </span>
            <button 
              className="icon-btn" 
              onClick={toggleTheme} 
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            {location.pathname.startsWith('/run/') && (
              <button 
                className="icon-btn" 
                onClick={() => setChatOpen(!chatOpen)} 
                title="Toggle activity timeline"
                aria-label="Toggle activity timeline"
                style={{ background: chatOpen ? 'var(--bg)' : 'var(--surface)' }}
              >
                <PanelRight size={14} />
              </button>
            )}
          </header>
        )}
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/run/:runId" element={<RunPage />} />
          <Route path="/history" element={<HomePage defaultTab="history" />} />
          <Route path="/sources" element={<SourcesPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
