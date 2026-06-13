import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log('--- FRONTEND INITIALIZING ---');

class RootErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('CRITICAL FRONTEND ERROR:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#3b1e1d', color: '#f43f5e', height: '100vh', fontFamily: 'sans-serif' }}>
          <h1>Something went wrong during initialization</h1>
          <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
            {this.state.error?.toString()}
          </pre>
          <p>Please check the browser console for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="color:red;padding:20px">Error: #root element not found in index.html</div>';
} else {
  console.log('Mounting React App...');
  ReactDOM.createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  )
}
