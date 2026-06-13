// @ts-nocheck
import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Text, Sphere } from '@react-three/drei'
import * as THREE from 'three'

// ── Agent node definitions ────────────────────────────────────────────────────
const NODES = [
  { id: 'triage',      label: 'Triage',      pos: [-5.2,  0.6,  0.0] as [number,number,number], color: '#f97316', r: 0.30 },
  { id: 'rag',         label: 'RAG Cache',   pos: [-3.2, -0.4,  0.8] as [number,number,number], color: '#3b82f6', r: 0.22 },
  { id: 'rca',         label: 'RCA',         pos: [-1.0,  0.6,  0.0] as [number,number,number], color: '#f97316', r: 0.26 },
  { id: 'browser',     label: 'Browser',     pos: [ 1.0,  2.0,  0.6] as [number,number,number], color: '#3b82f6', r: 0.22 },
  { id: 'web_search',  label: 'Web Search',  pos: [ 1.0, -0.8, -0.6] as [number,number,number], color: '#3b82f6', r: 0.22 },
  { id: 'self_heal',   label: 'Self-Heal',   pos: [ 0.0, -2.4,  0.3] as [number,number,number], color: '#ef4444', r: 0.22 },
  { id: 'remediation', label: 'Remediation', pos: [ 3.2,  0.6,  0.0] as [number,number,number], color: '#f97316', r: 0.26 },
  { id: 'reporter',    label: 'Reporter',    pos: [ 5.0,  0.6, -0.3] as [number,number,number], color: '#a855f7', r: 0.24 },
  { id: 'archive',     label: 'Archive',     pos: [ 6.6, -0.4,  0.4] as [number,number,number], color: '#22c55e', r: 0.20 },
]

const EDGES: [string, string][] = [
  ['triage',      'rag'],
  ['rag',         'rca'],
  ['rag',         'remediation'],
  ['rca',         'browser'],
  ['rca',         'web_search'],
  ['rca',         'remediation'],
  ['browser',     'web_search'],
  ['browser',     'remediation'],
  ['web_search',  'remediation'],
  ['self_heal',   'rca'],
  ['remediation', 'reporter'],
  ['reporter',    'archive'],
]

const NODE_POS = Object.fromEntries(NODES.map(n => [n.id, new THREE.Vector3(...n.pos)]))

// ── Signal orb that travels along an edge ─────────────────────────────────────
function SignalOrb({ from, to, speed, offset, color }: {
  from: string; to: string; speed: number; offset: number; color: string
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const t = useRef(offset % 1)
  const start = NODE_POS[from]
  const end   = NODE_POS[to]

  useFrame((_, delta) => {
    t.current = (t.current + delta * speed) % 1
    if (meshRef.current) {
      meshRef.current.position.lerpVectors(start, end, t.current)
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.055, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
    </mesh>
  )
}

// ── Individual agent node ──────────────────────────────────────────────────────
function GraphNode({ node, index }: { node: typeof NODES[0]; index: number }) {
  const meshRef  = useRef<THREE.Mesh>(null)
  const glowRef  = useRef<THREE.Mesh>(null)
  const phase    = useRef(index * 0.72)

  useFrame((_, delta) => {
    phase.current += delta * 0.45
    const dy = Math.sin(phase.current) * 0.10
    if (meshRef.current)  meshRef.current.position.y  = node.pos[1] + dy
    if (glowRef.current)  glowRef.current.position.y  = node.pos[1] + dy
  })

  return (
    <group>
      {/* Glow halo */}
      <mesh ref={glowRef} position={node.pos}>
        <sphereGeometry args={[node.r * 1.7, 16, 16]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.12}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>

      {/* Core sphere */}
      <mesh ref={meshRef} position={node.pos}>
        <sphereGeometry args={[node.r, 32, 32]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.55}
          transparent
          opacity={0.90}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[node.pos[0], node.pos[1] + node.r + 0.22, node.pos[2]]}
        fontSize={0.17}
        color="rgba(255,255,255,0.85)"
        anchorX="center"
        anchorY="bottom"
        renderOrder={1}
      >
        {node.label}
      </Text>
    </group>
  )
}

// ── Scene contents ─────────────────────────────────────────────────────────────
function Scene() {
  const edgePoints = useMemo(() =>
    EDGES.map(([from, to]) => ({
      from, to,
      pts: [NODE_POS[from].clone().toArray(), NODE_POS[to].clone().toArray()] as [number,number,number][],
    })), [])

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.25} />
      <pointLight position={[-6,  4, 4]} intensity={1.2} color="#f97316" />
      <pointLight position={[ 6, -3, 3]} intensity={0.8} color="#3b82f6" />
      <pointLight position={[ 0,  6, 2]} intensity={0.4} color="#ffffff" />

      {/* Nodes */}
      {NODES.map((n, i) => <GraphNode key={n.id} node={n} index={i} />)}

      {/* Edges */}
      {edgePoints.map(({ from, to, pts }) => (
        <Line
          key={`edge-${from}-${to}`}
          points={pts}
          color="#334155"
          lineWidth={1.1}
          transparent
          opacity={0.45}
        />
      ))}

      {/* Signal orbs — one per edge, staggered offsets */}
      {EDGES.map(([from, to], i) => (
        <SignalOrb
          key={`sig-${from}-${to}`}
          from={from}
          to={to}
          speed={0.28 + (i % 4) * 0.07}
          offset={i * 0.13}
          color={i % 2 === 0 ? '#f97316' : '#60a5fa'}
        />
      ))}

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.4}
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.9}
      />
    </>
  )
}

// ── Public component ───────────────────────────────────────────────────────────
export function HeroGraph3D() {
  return (
    <Canvas
      camera={{ position: [0.8, 0.5, 10.5], fov: 52 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  )
}
