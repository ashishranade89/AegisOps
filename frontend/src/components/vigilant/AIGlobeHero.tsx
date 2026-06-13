import { useEffect, useRef, useState } from "react";
import { Server, Database, Radio } from "lucide-react";

interface NodeItem {
  id: string;
  name: string;
  status: string;
  latency: string;
  angle: number;
  speed: number;
  radius: number;
  tilt: number;
  icon: string;
  color: string;
}

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
}

interface GlowPhoton {
  nodeId: string;
  progress: number;
  speed: number;
  color: string;
}

export function AIGlobeHero() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  // Interactive nodes orbiting the central globe
  const nodesRef = useRef<NodeItem[]>([
    { id: "aws", name: "AWS AP-WEST-1", status: "ONLINE", latency: "14ms", angle: 0, speed: 0.004, radius: 190, tilt: 0.4, icon: "AWS", color: "#FF9900" },
    { id: "stripe", name: "Stripe Webhooks", status: "STABLE", latency: "42ms", angle: 1.5, speed: -0.003, radius: 210, tilt: -0.25, icon: "API", color: "#635BFF" },
    { id: "nvidia", name: "NVIDIA H100 GPU Cluster", status: "ACTIVE", latency: "1.2ms", angle: 3.1, speed: 0.005, radius: 170, tilt: 0.1, icon: "GPU", color: "#76B900" },
    { id: "github", name: "GitHub Async Webhooks", status: "MONITORED", latency: "28ms", angle: 4.2, speed: -0.004, radius: 230, tilt: 0.5, icon: "GIT", color: "#181717" },
    { id: "auth0", name: "Auth0 JWT Key Gate", status: "HEALTHY", latency: "95ms", angle: 2.2, speed: 0.003, radius: 151, tilt: -0.6, icon: "KEY", color: "#EB5424" },
    { id: "opencl", name: "OpenCL Decentralized Engine", status: "COMPUTING", latency: "4.8ms", angle: 5.1, speed: -0.005, radius: 195, tilt: -0.15, icon: "NEUR", color: "#00E5FF" },
    { id: "edge", name: "Edge Proxy London", status: "LIVE", latency: "8ms", angle: 0.8, speed: 0.006, radius: 250, tilt: 0.35, icon: "EDGE", color: "#10B981" }
  ]);

  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const starsRef = useRef<Star[]>([]);
  const photonsRef = useRef<GlowPhoton[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let width = (canvas.width = containerRef.current?.clientWidth || 900);
    let height = (canvas.height = containerRef.current?.clientHeight || 520);

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      width = canvas.width = containerRef.current.clientWidth;
      height = canvas.height = containerRef.current.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    // Initial stars setup
    const starCount = 80;
    starsRef.current = Array.from({ length: starCount }).map(() => ({
      x: (Math.random() - 0.5) * 1600,
      y: (Math.random() - 0.5) * 1600,
      z: Math.random() * 800 + 100,
      color: `rgba(${180 + Math.random() * 75}, ${195 + Math.random() * 60}, 255, ${Math.random() * 0.4 + 0.1})`,
      size: Math.random() * 1.5 + 0.5
    }));

    // Mouse movement inside canvas coordinates for tilt
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouseRef.current.targetX = (x / width - 0.5) * 2; // -1 to 1 range
      mouseRef.current.targetY = (y / height - 0.5) * 2; // -1 to 1 range
      
      // Match coordinate lookup for tooltips on orbiting nodes
      let foundNode: NodeItem | null = null;
      const centerX = width / 2;
      const centerY = height / 2;

      // Project currently computed Node positions to see if we hover
      nodesRef.current.forEach((node) => {
        const tiltCos = Math.cos(node.tilt);
        const orbitX = Math.cos(node.angle) * node.radius;
        const orbitY = Math.sin(node.angle) * node.radius * tiltCos;

        // Apply mouse inertia rotations
        const currTiltX = mouseRef.current.x * 25;
        const currTiltY = mouseRef.current.y * 15;

        const posX = centerX + orbitX - orbitY * Math.sin(node.tilt) + currTiltX;
        const posY = centerY + orbitY + currTiltY;

        const dx = x - posX;
        const dy = y - posY;
        if (Math.sqrt(dx * dx + dy * dy) < 22) {
          foundNode = node;
          setTooltipPos({ x: posX + rect.left, y: posY + rect.top - 50 });
        }
      });
      setHoveredNode(foundNode);
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    // Create sparse light tracing bullets (photons) over time
    const interval = setInterval(() => {
      if (photonsRef.current.length < 12) {
        const randomNode = nodesRef.current[Math.floor(Math.random() * nodesRef.current.length)];
        photonsRef.current.push({
          nodeId: randomNode.id,
          progress: 0,
          speed: 0.007 + Math.random() * 0.01,
          color: randomNode.color
        });
      }
    }, 1800);

    let globeRotY = 0;
    
    // Primary Draw Loop
    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse damping
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      const centerX = width / 2;
      const centerY = height / 2;

      // Drawing Dark Starry Backdrop
      starsRef.current.forEach((star) => {
        // Perspective projections
        const px = (star.x / (star.z / 400)) + centerX + mouseRef.current.x * -20;
        const py = (star.y / (star.z / 400)) + centerY + mouseRef.current.y * -15;
        
        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          ctx.beginPath();
          ctx.arc(px, py, star.size, 0, Math.PI * 2);
          // Let stars twinkle subtly
          ctx.fillStyle = star.color;
          ctx.fill();
        }
        // Move star closer
        star.z -= 0.15;
        if (star.z < 10) star.z = 800; // Reset depth
      });

      // Central Cosmic Radial Glow Ambient Layer
      const radialGlow = ctx.createRadialGradient(
        centerX + mouseRef.current.x * 20, 
        centerY + mouseRef.current.y * 15, 
        10, 
        centerX + mouseRef.current.x * 20, 
        centerY + mouseRef.current.y * 15, 
        280
      );
      radialGlow.addColorStop(0, "rgba(22, 38, 92, 0.45)");
      radialGlow.addColorStop(0.3, "rgba(10, 18, 51, 0.25)");
      radialGlow.addColorStop(0.65, "rgba(5, 8, 25, 0.08)");
      radialGlow.addColorStop(1, "rgba(2, 4, 10, 0)");

      ctx.fillStyle = radialGlow;
      ctx.beginPath();
      ctx.arc(centerX + mouseRef.current.x * 20, centerY + mouseRef.current.y * 15, 280, 0, Math.PI * 2);
      ctx.fill();

      // Draw beautiful orbiting connection lines behind globe first
      nodesRef.current.forEach((node) => {
        node.angle += node.speed;
        
        // Compute 3D path coordinates
        ctx.beginPath();
        const segments = 120;
        for (let j = 0; j <= segments; j++) {
          const theta = (j / segments) * Math.PI * 2;
          const tiltCos = Math.cos(node.tilt);
          const orbitX = Math.cos(theta) * node.radius;
          const orbitY = Math.sin(theta) * node.radius * tiltCos;

          const px = centerX + orbitX - orbitY * Math.sin(node.tilt) + mouseRef.current.x * 25;
          const py = centerY + orbitY + mouseRef.current.y * 15;

          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(100, 160, 255, 0.075)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw the central 3D wireframe network sphere
      globeRotY += 0.0018;
      const sphereRadius = 120;
      const gridCountHorizontal = 10;
      const gridCountVertical = 10;

      // Draw glowing sphere backdrop
      const sphereGrad = ctx.createRadialGradient(
        centerX + mouseRef.current.x * 25 - 20,
        centerY + mouseRef.current.y * 15 - 20,
        10,
        centerX + mouseRef.current.x * 25,
        centerY + mouseRef.current.y * 15,
        sphereRadius
      );
      sphereGrad.addColorStop(0, "rgba(110, 180, 255, 0.18)");
      sphereGrad.addColorStop(0.5, "rgba(66, 110, 230, 0.07)");
      sphereGrad.addColorStop(1, "rgba(10, 20, 50, 0.5)");

      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(centerX + mouseRef.current.x * 25, centerY + mouseRef.current.y * 15, sphereRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw longitudinal lines
      for (let i = 0; i < gridCountHorizontal; i++) {
        const lonAngle = (i / gridCountHorizontal) * Math.PI + globeRotY;
        ctx.beginPath();
        for (let j = 0; j <= 50; j++) {
          const latAngle = (j / 50) * Math.PI * 2;
          const r = sphereRadius * Math.sin(latAngle);
          
          const sx = r * Math.sin(lonAngle);
          const sy = sphereRadius * Math.cos(latAngle);
          const sz = r * Math.cos(lonAngle);

          // Rotate coordinate with mouse tilt
          const finalX = centerX + sx + mouseRef.current.x * 25;
          const finalY = centerY + sy + mouseRef.current.y * 15;

          // Only draw lines on the facing hemisphere for premium 3D look
          if (sz > -20) {
            if (j === 0) ctx.moveTo(finalX, finalY);
            else ctx.lineTo(finalX, finalY);
          }
        }
        ctx.strokeStyle = "rgba(125, 175, 255, 0.09)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Draw latitudinal rings
      for (let i = 1; i < gridCountVertical; i++) {
        const phi = (i / gridCountVertical) * Math.PI;
        const currentLatY = sphereRadius * Math.cos(phi);
        const currentLatRadius = sphereRadius * Math.sin(phi);

        ctx.beginPath();
        for (let j = 0; j <= 50; j++) {
          const theta = (j / 50) * Math.PI * 2 + globeRotY;
          const sx = currentLatRadius * Math.sin(theta);
          const sz = currentLatRadius * Math.cos(theta);

          const finalX = centerX + sx + mouseRef.current.x * 25;
          const finalY = centerY + currentLatY + mouseRef.current.y * 15;

          if (sz > -15) {
            if (j === 0) ctx.moveTo(finalX, finalY);
            else ctx.lineTo(finalX, finalY);
          }
        }
        ctx.strokeStyle = "rgba(125, 175, 255, 0.07)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Sphere core bright nodes (resembling synaptic neural flashes)
      const internalPulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(centerX + mouseRef.current.x * 25, centerY + mouseRef.current.y * 15, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(130, 210, 255, ${0.4 * internalPulse})`;
      ctx.fill();

      // Outer rings of glowing telemetry wires & custom connection paths
      ctx.beginPath();
      ctx.arc(centerX + mouseRef.current.x * 25, centerY + mouseRef.current.y * 15, sphereRadius + 14, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(150, 100, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([12, 18]);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // Dynamic Photons traveling down orbit cables
      photonsRef.current.forEach((photon, index) => {
        const targetNode = nodesRef.current.find(n => n.id === photon.nodeId);
        if (!targetNode) return;

        photon.progress += photon.speed;
        if (photon.progress >= 1) {
          // Remove if destination hit
          photonsRef.current.splice(index, 1);
          return;
        }

        // Project photon trajectory along connection splines
        const currentAngle = targetNode.angle - (1 - photon.progress) * Math.PI * 1.5;
        const tiltCos = Math.cos(targetNode.tilt);
        const orbitX = Math.cos(currentAngle) * targetNode.radius;
        const orbitY = Math.sin(currentAngle) * targetNode.radius * tiltCos;

        const px = centerX + orbitX - orbitY * Math.sin(targetNode.tilt) + mouseRef.current.x * 25;
        const py = centerY + orbitY + mouseRef.current.y * 15;

        // Draw photon bullet with trail
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = photon.color;
        ctx.shadowColor = photon.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow

        ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Render actual outer Orbiting Nodes with elegant 3D scaling
      // Sort nodes by z-index position in orbit so they render sequentially (background to foreground)
      const sortedNodes = [...nodesRef.current].sort((a, b) => {
        // Z calculated by position on orbit projection
        const za = Math.sin(a.angle) * Math.cos(a.tilt);
        const zb = Math.sin(b.angle) * Math.cos(b.tilt);
        return za - zb;
      });

      sortedNodes.forEach((node) => {
        const tiltCos = Math.cos(node.tilt);
        const orbitX = Math.cos(node.angle) * node.radius;
        const orbitY = Math.sin(node.angle) * node.radius * tiltCos;

        // Apply visual offset tilt on hover or mouse
        const isThisHovered = hoveredNode?.id === node.id;
        const activeHoverOffset = isThisHovered ? 1.08 : 1.0;

        const posX = centerX + orbitX - orbitY * Math.sin(node.tilt) + mouseRef.current.x * 25;
        const posY = centerY + orbitY + mouseRef.current.y * 15;

        // Depth scale (scale factor down when behind, up when close)
        const depthFactor = Math.sin(node.angle) * Math.cos(node.tilt); // -1 to 1
        const scaleZ = 0.75 + (depthFactor + 1) * 0.25; // 0.5 to 1.05

        const finalNodeScale = scaleZ * activeHoverOffset;

        // 3D glow core ring around node
        ctx.beginPath();
        ctx.arc(posX, posY, 14 * finalNodeScale, 0, Math.PI * 2);
        const nodeGrad = ctx.createRadialGradient(posX, posY, 2 * finalNodeScale, posX, posY, 14 * finalNodeScale);
        nodeGrad.addColorStop(0, "rgba(10, 18, 40, 0.9)");
        nodeGrad.addColorStop(0.7, node.color + "1e");
        nodeGrad.addColorStop(1, node.color + "55");
        ctx.fillStyle = nodeGrad;
        ctx.fill();

        ctx.strokeStyle = isThisHovered ? "#FFFFFF" : node.color + "aa";
        ctx.lineWidth = isThisHovered ? 2 : 1;
        ctx.stroke();

        // Node inner dot
        ctx.beginPath();
        ctx.arc(posX, posY, 3.5 * finalNodeScale, 0, Math.PI * 2);
        ctx.fillStyle = isThisHovered ? "#FFFFFF" : node.color;
        ctx.fill();

        // Draw micro text overlays for nodes in foreground (where scaleZ > 0.8)
        if (scaleZ > 0.78) {
          ctx.fillStyle = isThisHovered ? "#FFFFFF" : "rgba(226, 232, 240, 0.85)";
          ctx.font = `bold ${Math.max(8, 9 * finalNodeScale)}px font-mono`;
          ctx.textAlign = "center";
          ctx.fillText(node.icon, posX, posY - 18 * finalNodeScale);

          // Subtle connection traces back to center
          ctx.beginPath();
          ctx.moveTo(posX, posY);
          ctx.lineTo(centerX + mouseRef.current.x * 25, centerY + mouseRef.current.y * 15);
          ctx.strokeStyle = isThisHovered ? `rgba(255, 255, 255, 0.14)` : `rgba(100, 150, 255, 0.035)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });

      animFrame = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animFrame);
      clearInterval(interval);
    };
  }, [hoveredNode]);

  return (
    <div ref={containerRef} className="relative w-full h-[520px] rounded-2xl overflow-hidden select-none bg-gradient-to-b from-slate-955/20 via-[#030612] to-slate-955/20 border border-white/5 shadow-2xl flex flex-col items-center justify-center">
      
      {/* Decorative cosmic background overlay */}
      <div className="absolute inset-0 bg-radial-gradient pointer-events-none opacity-40"></div>
      
      {/* Absolute Left Overlay Label */}
      <div className="absolute left-6 md:left-12 top-1/2 -translate-y-1/2 flex flex-col items-start font-mono pointer-events-none z-10">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping mb-2.5"></span>
        <h5 className="text-[10px] tracking-[0.25em] text-blue-400 font-bold uppercase whitespace-nowrap">
          AUTONOMOUS AI NETWORK
        </h5>
        <div className="w-16 h-[1px] bg-gradient-to-r from-blue-500/50 to-transparent mt-1 mb-2"></div>
        <p className="text-[9px] text-slate-500 max-w-[120px] leading-relaxed">
          ACTIVE GATEWAYS: 07/07<br />
          ANOMALY INDEX: 0.02%
        </p>
      </div>

      {/* Absolute Right Overlay Label */}
      <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 flex flex-col items-end font-mono pointer-events-none text-right z-10">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse mb-2.5"></span>
        <h5 className="text-[10px] tracking-[0.22em] text-indigo-400 font-bold uppercase whitespace-nowrap">
          DECENTRALIZED INTELLIGENCE
        </h5>
        <div className="w-16 h-[1px] bg-gradient-to-l from-indigo-500/50 to-transparent mt-1 mb-2"></div>
        <p className="text-[9px] text-slate-500 max-w-[120px] leading-relaxed">
          THREAT SCORE: 12<br />
          INTELLIGENCE: GEMINI
        </p>
      </div>

      {/* Main Canvas layer representing the beautiful 3D particle globe */}
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair relative z-0" />

      {/* Fully Animated Custom Hover Tooltip */}
      {hoveredNode && (
        <div 
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px`, 
            transform: "translate(-50%, -100%)" 
          }}
          className="fixed z-50 pointer-events-none p-3.5 rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-md shadow-2xl font-mono text-[11px] animate-fadeIn flex flex-col min-w-[200px]"
        >
          {/* Node details */}
          <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 mb-1.5">
            <span className="font-bold text-slate-100 uppercase text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredNode.color }}></span>
              {hoveredNode.name}
            </span>
            <span className="font-extrabold text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
              {hoveredNode.icon}
            </span>
          </div>

          <div className="space-y-1 text-slate-400 text-[10px]">
            <div className="flex justify-between">
              <span>STATUS:</span>
              <span className="font-bold text-emerald-400">{hoveredNode.status}</span>
            </div>
            <div className="flex justify-between">
              <span>LATENCY METRIC:</span>
              <span className="font-bold text-sky-400 font-mono">{hoveredNode.latency}</span>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Bottom visual panel details */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-6 text-[10px] font-mono text-slate-400/80 pointer-events-none z-10 shrink-0 bg-slate-950/65 px-4 py-1.5 border border-white/5 rounded-full backdrop-blur-sm shadow-lg">
        <span className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          Nodes: 7 Active
        </span>
        <span className="w-[1px] h-3 bg-white/10"></span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          Channels: Continuous Trace
        </span>
        <span className="w-[1px] h-3 bg-white/10"></span>
        <span className="flex items-center gap-1.5 font-bold text-slate-205">
          <Radio className="w-3.5 h-3.5 text-rose-500 animate-ping" />
          Telemetry Linked
        </span>
      </div>

    </div>
  );
}
export default AIGlobeHero;
