import {
  prepareWithSegments,
  layoutWithLines,
  walkLineRanges,
  layout,
  clearCache,
} from '@chenglou/pretext'
import JSZip from 'jszip'
import { generateGraph, CATEGORY_COLORS } from './data.js'

// ── Fonts ─────────────────────────────────────────────────────────
const NODE_FONT = '13px Inter'
const EDGE_FONT = '11px Inter'
const NODE_LINE_HEIGHT = 18
const EDGE_LINE_HEIGHT = 14
const NODE_PADDING_X = 12
const NODE_PADDING_Y = 10
const NODE_RADIUS = 8
const MIN_NODE_WIDTH = 60
const MAX_NODE_WIDTH = 180

// ── Colors ────────────────────────────────────────────────────────
const COLORS = {
  nodeFill: '#1e293b',
  nodeStroke: '#334155',
  nodeText: '#f1f5f9',
  edgeLine: '#334155',
  edgeArrow: '#475569',
  edgeLabel: '#64748b',
  edgeLabelBg: '#0f172a',
  selectionRing: '#38bdf8',
  hoverRing: '#64748b',
  canvasBg: '#0f172a',
  gridDot: '#1e293b',
}

// ── Spring Physics Config ─────────────────────────────────────────
const SPRING_STIFFNESS = 0.002
const SPRING_REST_LENGTH = 160
const SPRING_DAMPING = 0.82
const REPULSION_STRENGTH = 12000
const VELOCITY_THRESHOLD = 0.05

// ── Graph Data ────────────────────────────────────────────────────
const initialData = generateGraph()
let nodes = initialData.nodes
let edges = initialData.edges

// ── Filter / Grouping State ───────────────────────────────────────
// filter: { type: 'category'|'search', value: string } | null
let activeFilter = null
let matchingNodeIds = new Set() // ids of nodes that match current filter

// ── Camera Tween ──────────────────────────────────────────────────
// Smoothly animate the camera to a target position/zoom
let cameraTween = null // { tx, ty, tz, frames, total }

function tweenCamera(tx, ty, tz, frames = 45) {
  cameraTween = { tx, ty, tz, frames, total: frames }
}

function stepCameraTween() {
  if (!cameraTween) return
  const t = 1 - cameraTween.frames / cameraTween.total
  // Ease out cubic
  const ease = 1 - Math.pow(1 - Math.min(t + 1 / cameraTween.total, 1), 3)
  camera.x += (cameraTween.tx - camera.x) * ease * 0.18
  camera.y += (cameraTween.ty - camera.y) * ease * 0.18
  camera.zoom += (cameraTween.tz - camera.zoom) * ease * 0.18
  cameraTween.frames--
  if (cameraTween.frames <= 0) cameraTween = null
  needsRender = true
}

function setFilter(filter) {
  activeFilter = filter
  matchingNodeIds.clear()

  const badge = document.getElementById('filter-badge')
  const badgeLabel = document.getElementById('filter-label')
  const searchBar = document.getElementById('search-bar')

  if (!filter) {
    badge.classList.remove('visible')
    searchBar.classList.remove('active')
    wakeSimulation()
    needsRender = true
    needsPanelRender = true
    return
  }

  // Compute matching nodes
  for (const node of nodes) {
    if (filter.type === 'category') {
      if (node.category === filter.value) matchingNodeIds.add(node.id)
    } else if (filter.type === 'search') {
      const q = filter.value.toLowerCase()
      const haystack = [
        node.label,
        node.category,
        ...(node.tags || []),
        ...(node.issues || []).map(i => '#' + i),
        node.desc || '',
      ].join(' ').toLowerCase()
      if (haystack.includes(q)) matchingNodeIds.add(node.id)
    }
  }

  // Show badge
  const color = filter.type === 'category' ? (CATEGORY_COLORS[filter.value] || '#38bdf8') : '#38bdf8'
  badge.style.background = color + '33'
  badge.style.color = color
  badge.style.border = `1px solid ${color}`
  badgeLabel.textContent = filter.value
  badge.classList.add('visible')
  if (filter.type === 'search') searchBar.classList.add('active')

  // Tween camera to focus on world origin where cluster will gather
  // Estimate a reasonable zoom based on number of matching nodes
  const count = matchingNodeIds.size
  const targetZoom = count <= 5 ? 1.2 : count <= 15 ? 0.9 : count <= 30 ? 0.7 : 0.55
  const tx = width / 2
  const ty = height / 2
  tweenCamera(tx, ty, targetZoom)

  wakeSimulation()
  needsRender = true
  needsPanelRender = true
}

function isNodeMatching(node) {
  if (!activeFilter) return true
  return matchingNodeIds.has(node.id)
}

// ── Pink Pixel Octopus ────────────────────────────────────────────
const OCTO_SCALE = 3  // pixel scale factor
const OCTO_REPEL_RADIUS = 250
const OCTO_REPEL_STRENGTH = 60000

// 16x16 pixel art frames (1=body, 2=eye, 3=cheek, 0=empty)
// 4 dance frames, mirrored for left-facing
const OCTO_FRAMES_RIGHT = [
  // Frame 0: neutral
  [
    '0000001111000000',
    '0000111111100000',
    '0001111111110000',
    '0011111111111000',
    '0011121112111000',
    '0011121112111000',
    '0011111111111000',
    '0011131111311000',
    '0001111111110000',
    '0001111111110000',
    '0011011011011000',
    '0110011011001100',
    '0100010010001000',
    '0000010010000000',
    '0000000000000000',
    '0000000000000000',
  ],
  // Frame 1: tentacles out
  [
    '0000001111000000',
    '0000111111100000',
    '0001111111110000',
    '0011111111111000',
    '0011121112111000',
    '0011121112111000',
    '0011111111111000',
    '0011131111311000',
    '0001111111110000',
    '0001111111110000',
    '0010110110110100',
    '0100100100101000',
    '1001001001010000',
    '0010000010000000',
    '0000000000000000',
    '0000000000000000',
  ],
  // Frame 2: bounce up
  [
    '0000000000000000',
    '0000001111000000',
    '0000111111100000',
    '0001111111110000',
    '0011111111111000',
    '0011121112111000',
    '0011121112111000',
    '0011111111111000',
    '0011131111311000',
    '0001111111110000',
    '0001111111110000',
    '0011011011011000',
    '0010010010010000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
  ],
  // Frame 3: tentacles wave
  [
    '0000001111000000',
    '0000111111100000',
    '0001111111110000',
    '0011111111111000',
    '0011121112111000',
    '0011121112111000',
    '0011111111111000',
    '0011131111311000',
    '0001111111110000',
    '0001111111110000',
    '0001101101101000',
    '0010010010010100',
    '0100100100100010',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
  ],
]

const OCTO_COLORS = {
  1: '#f472b6', // body - pink
  2: '#1e1e2e', // eyes - dark
  3: '#fda4af', // cheeks - light pink
}

let octo = {
  x: 300, y: 300,
  vx: 0, vy: 0,
  frame: 0,
  frameTimer: 0,
  facingLeft: false,
  isDragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
}

function drawOctopus() {
  const frames = OCTO_FRAMES_RIGHT
  const frameData = frames[Math.floor(octo.frame) % frames.length]
  const s = OCTO_SCALE / camera.zoom
  const ox = octo.x - (8 * s)
  const oy = octo.y - (8 * s)

  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const srcCol = octo.facingLeft ? (15 - col) : col
      const pixel = frameData[row][srcCol]
      if (pixel === '0') continue
      const color = OCTO_COLORS[pixel] || '#f472b6'
      ctx.fillStyle = color
      ctx.fillRect(ox + col * s, oy + row * s, s + 0.5, s + 0.5)
    }
  }

  // Draw a little shadow underneath
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(octo.x, octo.y + 9 * s, 7 * s, 2 * s, 0, 0, Math.PI * 2)
  ctx.fill()
}

function hitTestOctopus(wx, wy) {
  const s = OCTO_SCALE / camera.zoom
  const halfW = 8 * s
  const halfH = 8 * s
  return Math.abs(wx - octo.x) < halfW && Math.abs(wy - octo.y) < halfH
}

// ── Pretext Cache ─────────────────────────────────────────────────
const preparedNodeCache = new Map()
const preparedEdgeCache = new Map()
const nodeSizeCache = new Map()

function getPreparedNode(text) {
  if (!preparedNodeCache.has(text)) {
    preparedNodeCache.set(text, prepareWithSegments(text, NODE_FONT))
  }
  return preparedNodeCache.get(text)
}

function getPreparedEdge(text) {
  if (!preparedEdgeCache.has(text)) {
    preparedEdgeCache.set(text, prepareWithSegments(text, EDGE_FONT))
  }
  return preparedEdgeCache.get(text)
}

function computeNodeSize(node) {
  const key = node.label
  if (nodeSizeCache.has(key)) return nodeSizeCache.get(key)

  const prepared = getPreparedNode(node.label)
  const maxTextWidth = MAX_NODE_WIDTH - NODE_PADDING_X * 2

  let tightestWidth = 0
  walkLineRanges(prepared, maxTextWidth, (line) => {
    if (line.width > tightestWidth) tightestWidth = line.width
  })

  const textWidth = Math.max(tightestWidth, MIN_NODE_WIDTH - NODE_PADDING_X * 2)
  const nodeWidth = textWidth + NODE_PADDING_X * 2
  const result = layoutWithLines(prepared, maxTextWidth, NODE_LINE_HEIGHT)
  const nodeHeight = result.height + NODE_PADDING_Y * 2

  const size = { width: nodeWidth, height: nodeHeight, lines: result.lines }
  nodeSizeCache.set(key, size)
  return size
}

// ── Canvas Setup ──────────────────────────────────────────────────
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const panelCanvas = document.getElementById('panel-canvas')
const panelCtx = panelCanvas.getContext('2d')
const fileInput = document.getElementById('file-input')

let width, height, dpr
let panelW = 360, panelH = 0
let camera = { x: 0, y: 0, zoom: 1 }
let selectedNodeId = null
let hoveredNodeId = null
let draggingNode = null
let isPanning = false
let panStart = { x: 0, y: 0 }
let panCameraStart = { x: 0, y: 0 }
let needsRender = true
let needsPanelRender = true

function resize() {
  dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  width = rect.width
  height = rect.height
  canvas.width = width * dpr
  canvas.height = height * dpr

  const pRect = panelCanvas.getBoundingClientRect()
  panelW = pRect.width
  panelH = pRect.height
  panelCanvas.width = panelW * dpr
  panelCanvas.height = panelH * dpr

  needsRender = true
  needsPanelRender = true
}
window.addEventListener('resize', resize)
resize()

// ── Coordinate Transforms ─────────────────────────────────────────
function screenToWorld(sx, sy) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  }
}

// ── Hit Testing ───────────────────────────────────────────────────
function hitTestNode(wx, wy) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const size = computeNodeSize(node)
    const left = node.x - size.width / 2
    const top = node.y - size.height / 2
    if (wx >= left && wx <= left + size.width && wy >= top && wy <= top + size.height) {
      return node
    }
  }
  return null
}

// ── Drawing ───────────────────────────────────────────────────────
function drawGrid() {
  const spacing = 30
  const startX = Math.floor(-camera.x / camera.zoom / spacing) * spacing
  const startY = Math.floor(-camera.y / camera.zoom / spacing) * spacing
  const endX = startX + (width / camera.zoom) + spacing * 2
  const endY = startY + (height / camera.zoom) + spacing * 2

  ctx.fillStyle = COLORS.gridDot
  for (let gx = startX; gx < endX; gx += spacing) {
    for (let gy = startY; gy < endY; gy += spacing) {
      ctx.beginPath()
      ctx.arc(gx, gy, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawEdge(edge) {
  const srcNode = nodes.find(n => n.id === edge.source)
  const tgtNode = nodes.find(n => n.id === edge.target)
  if (!srcNode || !tgtNode) return

  // Dim edges where neither endpoint matches filter
  if (activeFilter) {
    const srcMatch = matchingNodeIds.has(srcNode.id)
    const tgtMatch = matchingNodeIds.has(tgtNode.id)
    if (!srcMatch && !tgtMatch) {
      ctx.globalAlpha = 0.06
    } else if (!srcMatch || !tgtMatch) {
      ctx.globalAlpha = 0.15
    }
  }

  const srcSize = computeNodeSize(srcNode)
  const tgtSize = computeNodeSize(tgtNode)

  const sx = srcNode.x, sy = srcNode.y
  const tx = tgtNode.x, ty = tgtNode.y

  const start = clipLineToRect(sx, sy, tx, ty, srcSize.width, srcSize.height)
  const end = clipLineToRect(tx, ty, sx, sy, tgtSize.width, tgtSize.height)

  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = COLORS.edgeLine
  ctx.lineWidth = 1 / camera.zoom
  ctx.stroke()

  // Arrowhead
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const arrowLen = 8 / camera.zoom
  ctx.beginPath()
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(end.x - arrowLen * Math.cos(angle - 0.35), end.y - arrowLen * Math.sin(angle - 0.35))
  ctx.lineTo(end.x - arrowLen * Math.cos(angle + 0.35), end.y - arrowLen * Math.sin(angle + 0.35))
  ctx.closePath()
  ctx.fillStyle = COLORS.edgeArrow
  ctx.fill()

  // Edge label (only show when zoomed in enough)
  if (edge.label && camera.zoom > 0.35) {
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2

    const prepared = getPreparedEdge(edge.label)
    const { height: textHeight } = layout(prepared, 9999, EDGE_LINE_HEIGHT)
    const result = layoutWithLines(prepared, 150, EDGE_LINE_HEIGHT)
    const labelWidth = result.lines.length > 0 ? Math.max(...result.lines.map(l => l.width)) : 0

    const padX = 4 / camera.zoom
    const padY = 1 / camera.zoom

    ctx.fillStyle = COLORS.edgeLabelBg
    ctx.fillRect(midX - labelWidth / 2 - padX, midY - textHeight / 2 - padY, labelWidth + padX * 2, textHeight + padY * 2)

    ctx.font = EDGE_FONT
    ctx.fillStyle = COLORS.edgeLabel
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = 0; i < result.lines.length; i++) {
      ctx.fillText(result.lines[i].text, midX, midY - textHeight / 2 + i * EDGE_LINE_HEIGHT)
    }
  }

  ctx.globalAlpha = 1.0
}

function clipLineToRect(cx, cy, tx, ty, w, h) {
  const dx = tx - cx
  const dy = ty - cy
  const hw = w / 2
  const hh = h / 2

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  let t = 1
  if (dx !== 0) {
    const tLeft = -hw / dx
    const tRight = hw / dx
    const tX = Math.max(Math.min(tLeft, tRight), 0)
    if (tX < t && tX > 0) t = tX
  }
  if (dy !== 0) {
    const tTop = -hh / dy
    const tBottom = hh / dy
    const tY = Math.max(Math.min(tTop, tBottom), 0)
    if (tY < t && tY > 0) t = tY
  }

  return { x: cx + dx * t, y: cy + dy * t }
}

function getCategoryColor(node) {
  if (node.category && CATEGORY_COLORS[node.category]) {
    return CATEGORY_COLORS[node.category]
  }
  return '#64748b'
}

function drawNode(node) {
  const size = computeNodeSize(node)
  const x = node.x - size.width / 2
  const y = node.y - size.height / 2
  const w = size.width
  const h = size.height
  const catColor = getCategoryColor(node)
  const matching = isNodeMatching(node)
  const dimmed = activeFilter && !matching

  // Apply dimming via globalAlpha
  if (dimmed) ctx.globalAlpha = 0.15

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 6 / camera.zoom
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2 / camera.zoom

  // Node background
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, NODE_RADIUS)
  ctx.fillStyle = COLORS.nodeFill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Category color left accent bar
  ctx.save()
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, NODE_RADIUS)
  ctx.clip()
  ctx.fillStyle = catColor
  ctx.fillRect(x, y, 4, h)
  ctx.restore()

  // Border — matching nodes get a glow when filtered
  const isHovered = hoveredNodeId === node.id
  const isSelected = selectedNodeId === node.id
  if (activeFilter && matching && !isSelected) {
    ctx.strokeStyle = catColor
    ctx.lineWidth = 2 / camera.zoom
  } else {
    ctx.strokeStyle = isSelected ? COLORS.selectionRing : isHovered ? catColor : COLORS.nodeStroke
    ctx.lineWidth = (isSelected ? 2 : 1.5) / camera.zoom
  }
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, NODE_RADIUS)
  ctx.stroke()

  // Label text
  ctx.font = NODE_FONT
  ctx.fillStyle = COLORS.nodeText
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const maxTextWidth = MAX_NODE_WIDTH - NODE_PADDING_X * 2
  const prepared = getPreparedNode(node.label)
  const result = layoutWithLines(prepared, maxTextWidth, NODE_LINE_HEIGHT)

  const textX = x + NODE_PADDING_X + 2 // offset for accent bar
  const textY = y + NODE_PADDING_Y
  for (let i = 0; i < result.lines.length; i++) {
    ctx.fillText(result.lines[i].text, textX, textY + i * NODE_LINE_HEIGHT)
  }

  if (dimmed) ctx.globalAlpha = 1.0
}

function drawSelectionRing(node) {
  const size = computeNodeSize(node)
  const x = node.x - size.width / 2
  const y = node.y - size.height / 2
  const pad = 4
  const catColor = getCategoryColor(node)
  ctx.beginPath()
  roundedRect(ctx, x - pad, y - pad, size.width + pad * 2, size.height + pad * 2, NODE_RADIUS + pad)
  ctx.strokeStyle = catColor
  ctx.lineWidth = 2.5 / camera.zoom
  ctx.setLineDash([6 / camera.zoom, 3 / camera.zoom])
  ctx.stroke()
  ctx.setLineDash([])
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = COLORS.canvasBg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  drawGrid()

  for (const edge of edges) {
    drawEdge(edge)
  }

  for (const node of nodes) {
    drawNode(node)
  }

  if (selectedNodeId) {
    const selectedNode = nodes.find(n => n.id === selectedNodeId)
    if (selectedNode) drawSelectionRing(selectedNode)
  }

  // Draw the octopus (on top of everything)
  drawOctopus()

  ctx.restore()

  // Draw legend in bottom-left corner of canvas
  drawLegend()

  needsRender = false
}

let legendHitRegions = [] // { x, y, w, h, category }
let hoveredLegendCat = null

function drawLegend() {
  legendHitRegions = []
  const categories = Object.entries(CATEGORY_COLORS)
  const legendX = 12
  const legendY = height - categories.length * 22 - 12
  const dotR = 5
  const rowH = 22

  // Background panel
  const legendW = 130
  const legendH = categories.length * rowH + 12
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.beginPath()
  const r = 8
  const lx = legendX - 6, ly = legendY - 6
  ctx.moveTo(lx + r, ly)
  ctx.lineTo(lx + legendW - r, ly)
  ctx.quadraticCurveTo(lx + legendW, ly, lx + legendW, ly + r)
  ctx.lineTo(lx + legendW, ly + legendH - r)
  ctx.quadraticCurveTo(lx + legendW, ly + legendH, lx + legendW - r, ly + legendH)
  ctx.lineTo(lx + r, ly + legendH)
  ctx.quadraticCurveTo(lx, ly + legendH, lx, ly + legendH - r)
  ctx.lineTo(lx, ly + r)
  ctx.quadraticCurveTo(lx, ly, lx + r, ly)
  ctx.closePath()
  ctx.fill()

  ctx.font = '11px Inter'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < categories.length; i++) {
    const [cat, color] = categories[i]
    const y = legendY + i * rowH
    const isActive = activeFilter && activeFilter.type === 'category' && activeFilter.value === cat
    const isHovered = hoveredLegendCat === cat

    // Highlight row on hover/active
    if (isActive || isHovered) {
      ctx.fillStyle = color + (isActive ? '33' : '1a')
      ctx.fillRect(legendX - 4, y - 2, legendW - 4, rowH)
    }

    ctx.beginPath()
    ctx.arc(legendX + dotR, y + dotR + 2, dotR, 0, Math.PI * 2)
    ctx.fillStyle = isActive ? color : (activeFilter && !isActive ? color + '66' : color)
    ctx.fill()

    ctx.fillStyle = isActive ? '#f1f5f9' : (isHovered ? '#cbd5e1' : '#94a3b8')
    ctx.fillText(cat, legendX + dotR * 2 + 8, y + dotR + 2)

    legendHitRegions.push({ x: legendX - 4, y: y - 2, w: legendW - 4, h: rowH, category: cat })
  }
}

// ── Spring Physics ────────────────────────────────────────────────
let simulationActive = false

function stepPhysics() {
  let totalKineticEnergy = 0

  for (const node of nodes) {
    node._fx = 0
    node._fy = 0
  }

  // Build node map for fast lookup
  const nodeMap = new Map()
  for (const node of nodes) nodeMap.set(node.id, node)

  // Spring forces along edges
  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    const tgt = nodeMap.get(edge.target)
    if (!src || !tgt) continue

    const dx = tgt.x - src.x
    const dy = tgt.y - src.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const displacement = dist - SPRING_REST_LENGTH
    const force = SPRING_STIFFNESS * displacement
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force

    src._fx += fx
    src._fy += fy
    tgt._fx -= fx
    tgt._fy -= fy
  }

  // Repulsion between all node pairs (use Barnes-Hut-like cutoff for performance)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distSq = dx * dx + dy * dy || 1
      // Skip very distant pairs for performance
      if (distSq > 1000000) continue
      const dist = Math.sqrt(distSq)
      const force = REPULSION_STRENGTH / distSq
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      a._fx -= fx
      a._fy -= fy
      b._fx += fx
      b._fy += fy
    }
  }

  // Filter grouping force: pull matching nodes toward world origin (0,0),
  // push non-matching away from it — so the cluster always gathers at screen centre
  if (activeFilter && matchingNodeIds.size > 0) {
    const PULL_STRENGTH = 0.022
    const PUSH_STRENGTH = 0.004

    for (const node of nodes) {
      // Vector from node toward world origin
      const dx = -node.x
      const dy = -node.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      if (matchingNodeIds.has(node.id)) {
        node._fx += dx * PULL_STRENGTH
        node._fy += dy * PULL_STRENGTH
      } else {
        // Push away, but only if reasonably close — distant non-matches left alone
        if (dist < 800) {
          node._fx -= dx * PUSH_STRENGTH
          node._fy -= dy * PUSH_STRENGTH
        }
      }
    }
  }

  // Octopus repels nearby nodes when being dragged
  if (octo.isDragging) {
    for (const node of nodes) {
      const dx = node.x - octo.x
      const dy = node.y - octo.y
      const distSq = dx * dx + dy * dy || 1
      const dist = Math.sqrt(distSq)
      if (dist < OCTO_REPEL_RADIUS) {
        const force = OCTO_REPEL_STRENGTH / distSq
        node._fx += (dx / dist) * force
        node._fy += (dy / dist) * force
      }
    }
  }

  for (const node of nodes) {
    if (draggingNode && node.id === draggingNode.id) {
      node.vx = 0
      node.vy = 0
      continue
    }

    node.vx = (node.vx + node._fx) * SPRING_DAMPING
    node.vy = (node.vy + node._fy) * SPRING_DAMPING

    node.x += node.vx
    node.y += node.vy

    totalKineticEnergy += node.vx * node.vx + node.vy * node.vy
  }

  // Keep simulation active while octopus dragging or filter grouping
  if (octo.isDragging) totalKineticEnergy = 1
  if (activeFilter && totalKineticEnergy > 0.001) totalKineticEnergy = Math.max(totalKineticEnergy, VELOCITY_THRESHOLD + 1)

  return totalKineticEnergy > VELOCITY_THRESHOLD
}

function wakeSimulation() {
  simulationActive = true
}

// ── Animation Loop ────────────────────────────────────────────────
function loop() {
  // Animate octopus dance frames
  octo.frameTimer += 1
  if (octo.frameTimer >= 12) { // ~5 fps dance at 60fps
    octo.frameTimer = 0
    octo.frame = (octo.frame + 1) % OCTO_FRAMES_RIGHT.length
    needsRender = true
  }

  if (cameraTween) stepCameraTween()

  if (simulationActive) {
    const still = !stepPhysics()
    if (still && !draggingNode) simulationActive = false
    needsRender = true
  }
  if (needsRender) render()
  if (needsPanelRender) renderPanel()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ── Side Panel ────────────────────────────────────────────────────
const PANEL_FONT_TITLE = '700 12px Inter'
const PANEL_FONT_HEADING = '600 16px Inter'
const PANEL_FONT_BODY = '13px Inter'
const PANEL_FONT_SMALL = '11px Inter'
const PANEL_FONT_BUTTON = '600 12px Inter'
const PANEL_FONT_CAT = '600 11px Inter'
const PANEL_LH_TITLE = 18
const PANEL_LH_HEADING = 22
const PANEL_LH_BODY = 18
const PANEL_LH_SMALL = 16
const PANEL_PAD = 16
const PANEL_COLORS = {
  bg: '#1e293b',
  title: '#94a3b8',
  heading: '#f1f5f9',
  body: '#cbd5e1',
  muted: '#64748b',
  dimmed: '#475569',
  sectionBg: '#0f172a',
  accent: '#38bdf8',
  buttonBg: '#334155',
  buttonHover: '#475569',
  buttonText: '#e2e8f0',
  dropZoneBorder: '#475569',
  dropZoneText: '#64748b',
  dropZoneActiveBorder: '#38bdf8',
  dropZoneActiveText: '#38bdf8',
  urlButton: '#2563eb',
  urlButtonHover: '#3b82f6',
}

const panelTextCache = new Map()
function getPanelPrepared(text, font) {
  const key = font + '|' + text
  if (!panelTextCache.has(key)) {
    panelTextCache.set(key, prepareWithSegments(text, font))
  }
  return panelTextCache.get(key)
}

let panelButtons = []
let panelHoveredButton = null
let isDraggingOverPanel = false
// Track panel scroll
let panelScrollY = 0
let panelContentHeight = 0

function drawPanelText(text, font, lineHeight, color, x, y, maxWidth) {
  const prepared = getPanelPrepared(text, font)
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  panelCtx.font = font
  panelCtx.fillStyle = color
  panelCtx.textAlign = 'left'
  panelCtx.textBaseline = 'top'
  for (let i = 0; i < result.lines.length; i++) {
    panelCtx.fillText(result.lines[i].text, x, y + i * lineHeight)
  }
  return result.height
}

function drawPanelButton(label, x, y, w, h, action, isHovered, bgColor, hoverColor) {
  const bg = bgColor || PANEL_COLORS.buttonBg
  const hov = hoverColor || PANEL_COLORS.buttonHover
  panelCtx.beginPath()
  const r = 6
  panelCtx.moveTo(x + r, y)
  panelCtx.lineTo(x + w - r, y)
  panelCtx.quadraticCurveTo(x + w, y, x + w, y + r)
  panelCtx.lineTo(x + w, y + h - r)
  panelCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  panelCtx.lineTo(x + r, y + h)
  panelCtx.quadraticCurveTo(x, y + h, x, y + h - r)
  panelCtx.lineTo(x, y + r)
  panelCtx.quadraticCurveTo(x, y, x + r, y)
  panelCtx.closePath()
  panelCtx.fillStyle = isHovered ? hov : bg
  panelCtx.fill()

  const prepared = getPanelPrepared(label, PANEL_FONT_BUTTON)
  const { lines } = layoutWithLines(prepared, w - 16, PANEL_LH_BODY)
  panelCtx.font = PANEL_FONT_BUTTON
  panelCtx.fillStyle = PANEL_COLORS.buttonText
  panelCtx.textAlign = 'center'
  panelCtx.textBaseline = 'middle'
  if (lines.length > 0) {
    panelCtx.fillText(lines[0].text, x + w / 2, y + h / 2)
  }

  panelButtons.push({ x, y, w, h, action })
}

function drawCategoryBadge(category, x, y, maxW) {
  const color = CATEGORY_COLORS[category] || '#64748b'
  const prepared = getPanelPrepared(category, PANEL_FONT_CAT)
  const result = layoutWithLines(prepared, maxW, PANEL_LH_SMALL)
  const textW = result.lines.length > 0 ? result.lines[0].width : 0
  const badgeW = textW + 16
  const badgeH = 20

  // Badge background
  panelCtx.beginPath()
  const r = 4
  panelCtx.moveTo(x + r, y)
  panelCtx.lineTo(x + badgeW - r, y)
  panelCtx.quadraticCurveTo(x + badgeW, y, x + badgeW, y + r)
  panelCtx.lineTo(x + badgeW, y + badgeH - r)
  panelCtx.quadraticCurveTo(x + badgeW, y + badgeH, x + badgeW - r, y + badgeH)
  panelCtx.lineTo(x + r, y + badgeH)
  panelCtx.quadraticCurveTo(x, y + badgeH, x, y + badgeH - r)
  panelCtx.lineTo(x, y + r)
  panelCtx.quadraticCurveTo(x, y, x + r, y)
  panelCtx.closePath()
  panelCtx.fillStyle = color + '33' // 20% opacity
  panelCtx.fill()

  panelCtx.font = PANEL_FONT_CAT
  panelCtx.fillStyle = color
  panelCtx.textAlign = 'left'
  panelCtx.textBaseline = 'middle'
  if (result.lines.length > 0) {
    panelCtx.fillText(result.lines[0].text, x + 8, y + badgeH / 2)
  }

  return badgeH
}

function renderPanel() {
  panelButtons = []
  const p = PANEL_PAD
  const maxW = panelW - p * 2

  panelCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  panelCtx.clearRect(0, 0, panelW, panelH)

  panelCtx.fillStyle = PANEL_COLORS.bg
  panelCtx.fillRect(0, 0, panelW, panelH)

  // Apply scroll offset
  panelCtx.save()
  panelCtx.translate(0, -panelScrollY)

  let y = p

  // Title
  y += drawPanelText('CREATIVE AI TOOLS', PANEL_FONT_TITLE, PANEL_LH_TITLE, PANEL_COLORS.title, p, y, maxW)
  y += 10

  // Upload buttons
  drawPanelButton('Upload JSON / MD / ZIP', p, y, maxW, 30, 'upload', panelHoveredButton === 'upload')
  y += 30 + 6
  drawPanelButton('Export Graph JSON', p, y, maxW, 30, 'export', panelHoveredButton === 'export')
  y += 30 + 10

  // Drop zone
  const dzH = 50
  const dzBorder = isDraggingOverPanel ? PANEL_COLORS.dropZoneActiveBorder : PANEL_COLORS.dropZoneBorder
  const dzText = isDraggingOverPanel ? PANEL_COLORS.dropZoneActiveText : PANEL_COLORS.dropZoneText
  panelCtx.setLineDash([4, 4])
  panelCtx.strokeStyle = dzBorder
  panelCtx.lineWidth = 1.5
  panelCtx.strokeRect(p, y, maxW, dzH)
  panelCtx.setLineDash([])

  const dzLabel = isDraggingOverPanel ? 'Drop file here' : 'Drag & drop .json .md .zip'
  const dzPrepared = getPanelPrepared(dzLabel, PANEL_FONT_SMALL)
  const dzLines = layoutWithLines(dzPrepared, maxW - 20, PANEL_LH_SMALL)
  panelCtx.font = PANEL_FONT_SMALL
  panelCtx.fillStyle = dzText
  panelCtx.textAlign = 'center'
  panelCtx.textBaseline = 'middle'
  if (dzLines.lines.length > 0) {
    panelCtx.fillText(dzLines.lines[0].text, p + maxW / 2, y + dzH / 2)
  }
  y += dzH + 12

  // Divider
  panelCtx.fillStyle = PANEL_COLORS.sectionBg
  panelCtx.fillRect(p, y, maxW, 1)
  y += 12

  // Selected node details or placeholder
  if (selectedNodeId) {
    const node = nodes.find(n => n.id === selectedNodeId)
    if (node) {
      // Category badge
      if (node.category) {
        y += drawCategoryBadge(node.category, p, y, maxW)
        y += 8
      }

      // Tool name
      y += drawPanelText(node.label, PANEL_FONT_HEADING, PANEL_LH_HEADING, PANEL_COLORS.heading, p, y, maxW)
      y += 10

      // Description — the main "what is this" content
      if (node.desc) {
        y += drawPanelText(node.desc, PANEL_FONT_BODY, PANEL_LH_BODY, PANEL_COLORS.body, p, y, maxW)
        y += 12
      }

      // Thin divider
      panelCtx.fillStyle = PANEL_COLORS.sectionBg
      panelCtx.fillRect(p, y, maxW, 1)
      y += 10

      // Open URL button
      if (node.url) {
        drawPanelButton('Open Link \u2197', p, y, maxW, 30, 'openurl', panelHoveredButton === 'openurl', PANEL_COLORS.urlButton, PANEL_COLORS.urlButtonHover)
        y += 30 + 10
      }

      // Issues + Tags row
      if (node.issues && node.issues.length > 0) {
        const issueText = 'Newsletter: ' + node.issues.map(i => '#' + i).join(', ')
        y += drawPanelText(issueText, PANEL_FONT_SMALL, PANEL_LH_SMALL, PANEL_COLORS.muted, p, y, maxW)
        y += 3
      }
      if (node.tags && node.tags.length > 0) {
        const tagText = node.tags.join('  ·  ')
        y += drawPanelText(tagText, PANEL_FONT_SMALL, PANEL_LH_SMALL, PANEL_COLORS.dimmed, p, y, maxW)
        y += 10
      }

      // Divider
      panelCtx.fillStyle = PANEL_COLORS.sectionBg
      panelCtx.fillRect(p, y, maxW, 1)
      y += 10

      // Connected tools
      const connected = edges
        .filter(e => e.source === node.id || e.target === node.id)
        .map(e => {
          const otherId = e.source === node.id ? e.target : e.source
          const other = nodes.find(n => n.id === otherId)
          return { label: e.label, node: other }
        })
        .filter(c => c.node)

      y += drawPanelText(`CONNECTIONS (${connected.length})`, PANEL_FONT_TITLE, PANEL_LH_TITLE, PANEL_COLORS.muted, p, y, maxW)
      y += 6

      if (connected.length === 0) {
        y += drawPanelText('No connections', PANEL_FONT_BODY, PANEL_LH_BODY, PANEL_COLORS.dimmed, p, y, maxW)
        y += 4
      } else {
        // Group by edge label
        const grouped = new Map()
        for (const c of connected) {
          if (!grouped.has(c.label)) grouped.set(c.label, [])
          grouped.get(c.label).push(c.node)
        }

        for (const [label, connNodes] of grouped) {
          // Section bg
          const sectionPad = 8
          const contentStart = y

          panelCtx.fillStyle = PANEL_COLORS.sectionBg
          // We'll draw bg after measuring content height
          const labelH = drawPanelText(label, PANEL_FONT_TITLE, PANEL_LH_TITLE, PANEL_COLORS.accent, p + sectionPad, y + sectionPad, maxW - sectionPad * 2)
          let innerY = y + sectionPad + labelH + 4

          for (const cn of connNodes) {
            const color = getCategoryColor(cn)
            // Dot
            panelCtx.beginPath()
            panelCtx.arc(p + sectionPad + 4, innerY + 7, 3, 0, Math.PI * 2)
            panelCtx.fillStyle = color
            panelCtx.fill()

            innerY += drawPanelText(cn.label, PANEL_FONT_BODY, PANEL_LH_BODY, PANEL_COLORS.body, p + sectionPad + 14, innerY, maxW - sectionPad * 2 - 14)
            innerY += 2
          }

          const totalH = innerY - contentStart + sectionPad

          // Draw bg behind (we need to redraw since we drew text first)
          // Instead, just add some visual separation
          panelCtx.fillStyle = PANEL_COLORS.sectionBg
          const bgR = 6
          panelCtx.beginPath()
          panelCtx.moveTo(p + bgR, contentStart)
          panelCtx.lineTo(p + maxW - bgR, contentStart)
          panelCtx.quadraticCurveTo(p + maxW, contentStart, p + maxW, contentStart + bgR)
          panelCtx.lineTo(p + maxW, contentStart + totalH - bgR)
          panelCtx.quadraticCurveTo(p + maxW, contentStart + totalH, p + maxW - bgR, contentStart + totalH)
          panelCtx.lineTo(p + bgR, contentStart + totalH)
          panelCtx.quadraticCurveTo(p, contentStart + totalH, p, contentStart + totalH - bgR)
          panelCtx.lineTo(p, contentStart + bgR)
          panelCtx.quadraticCurveTo(p, contentStart, p + bgR, contentStart)
          panelCtx.closePath()
          panelCtx.globalCompositeOperation = 'destination-over'
          panelCtx.fillStyle = PANEL_COLORS.sectionBg
          panelCtx.fill()
          panelCtx.globalCompositeOperation = 'source-over'

          y = contentStart + totalH + 6
        }
      }
    }
  } else {
    y += drawPanelText('Click a node to inspect', PANEL_FONT_BODY, PANEL_LH_BODY, PANEL_COLORS.dimmed, p, y, maxW)
    y += 6
    y += drawPanelText('Double-click to open link', PANEL_FONT_BODY, PANEL_LH_BODY, PANEL_COLORS.dimmed, p, y, maxW)
    y += 16
  }

  // Divider
  panelCtx.fillStyle = PANEL_COLORS.sectionBg
  panelCtx.fillRect(p, y, maxW, 1)
  y += 10

  // Stats
  const categories = new Set(nodes.map(n => n.category).filter(Boolean))
  const statsText = `${nodes.length} tools \u00b7 ${edges.length} connections \u00b7 ${categories.size} categories`
  y += drawPanelText(statsText, PANEL_FONT_SMALL, PANEL_LH_SMALL, PANEL_COLORS.dimmed, p, y, maxW)
  y += 14

  // Controls
  const controls = [
    'Scroll to zoom',
    'Drag canvas to pan',
    'Drag node to reposition',
    'Click node to select',
    'Double-click node to open link',
    'Delete / Backspace to remove',
  ]
  y += drawPanelText('CONTROLS', PANEL_FONT_TITLE, PANEL_LH_TITLE, PANEL_COLORS.muted, p, y, maxW)
  y += 4
  for (const line of controls) {
    y += drawPanelText('\u2022 ' + line, PANEL_FONT_SMALL, PANEL_LH_SMALL, PANEL_COLORS.dimmed, p, y, maxW)
    y += 2
  }

  y += 10
  y += drawPanelText('SUPPORTED FORMATS', PANEL_FONT_TITLE, PANEL_LH_TITLE, PANEL_COLORS.muted, p, y, maxW)
  y += 4
  const formats = [
    'JSON: { nodes: [...], edges: [...] }',
    'Markdown: ## Category / ### Tool',
    'ZIP: Multiple .md files bundled',
  ]
  for (const fl of formats) {
    y += drawPanelText('\u2022 ' + fl, PANEL_FONT_SMALL, PANEL_LH_SMALL, PANEL_COLORS.dimmed, p, y, maxW)
    y += 2
  }

  panelContentHeight = y + p + panelScrollY

  panelCtx.restore()
  needsPanelRender = false
}

// ── Panel Hit Testing ─────────────────────────────────────────────
function panelHitTest(sx, sy) {
  const adjustedY = sy + panelScrollY
  for (const btn of panelButtons) {
    if (sx >= btn.x && sx <= btn.x + btn.w && adjustedY >= btn.y && adjustedY <= btn.y + btn.h) {
      return btn
    }
  }
  return null
}

panelCanvas.addEventListener('mousemove', (e) => {
  const rect = panelCanvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const hit = panelHitTest(sx, sy)
  const newId = hit ? hit.action : null
  if (newId !== panelHoveredButton) {
    panelHoveredButton = newId
    panelCanvas.style.cursor = newId ? 'pointer' : 'default'
    needsPanelRender = true
  }
})

panelCanvas.addEventListener('mouseleave', () => {
  if (panelHoveredButton) {
    panelHoveredButton = null
    panelCanvas.style.cursor = 'default'
    needsPanelRender = true
  }
  if (isDraggingOverPanel) {
    isDraggingOverPanel = false
    needsPanelRender = true
  }
})

panelCanvas.addEventListener('click', (e) => {
  const rect = panelCanvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const hit = panelHitTest(sx, sy)
  if (hit) {
    if (hit.action === 'upload') fileInput.click()
    if (hit.action === 'export') exportGraph()
    if (hit.action === 'openurl') {
      const node = nodes.find(n => n.id === selectedNodeId)
      if (node && node.url) {
        window.open(node.url, '_blank')
      }
    }
  }
})

// Panel scroll
panelCanvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const maxScroll = Math.max(0, panelContentHeight - panelH)
  panelScrollY = Math.max(0, Math.min(maxScroll, panelScrollY + e.deltaY))
  needsPanelRender = true
}, { passive: false })

// ── Drag & Drop ───────────────────────────────────────────────────
panelCanvas.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (!isDraggingOverPanel) {
    isDraggingOverPanel = true
    needsPanelRender = true
  }
})

panelCanvas.addEventListener('dragleave', () => {
  if (isDraggingOverPanel) {
    isDraggingOverPanel = false
    needsPanelRender = true
  }
})

panelCanvas.addEventListener('drop', (e) => {
  e.preventDefault()
  isDraggingOverPanel = false
  needsPanelRender = true
  handleFiles(e.dataTransfer.files)
})

canvas.addEventListener('dragover', (e) => e.preventDefault())
canvas.addEventListener('drop', (e) => {
  e.preventDefault()
  handleFiles(e.dataTransfer.files)
})

// ── File Upload & Export ──────────────────────────────────────────
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files)
  fileInput.value = ''
})

async function handleFiles(fileList) {
  const allNodes = []
  const allEdges = []

  for (const file of fileList) {
    const name = file.name.toLowerCase()
    if (name.endsWith('.json')) {
      const text = await readFileText(file)
      try {
        const data = JSON.parse(text)
        if (data.nodes) {
          allNodes.push(...data.nodes)
          if (data.edges) allEdges.push(...data.edges)
        }
      } catch { /* ignore */ }
    } else if (name.endsWith('.md')) {
      const text = await readFileText(file)
      const parsed = parseMarkdown(text)
      allNodes.push(...parsed.nodes)
      allEdges.push(...parsed.edges)
    } else if (name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file)
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const lowerPath = path.toLowerCase()
        if (lowerPath.endsWith('.md')) {
          const text = await entry.async('string')
          const parsed = parseMarkdown(text)
          allNodes.push(...parsed.nodes)
          allEdges.push(...parsed.edges)
        } else if (lowerPath.endsWith('.json')) {
          const text = await entry.async('string')
          try {
            const data = JSON.parse(text)
            if (data.nodes) {
              allNodes.push(...data.nodes)
              if (data.edges) allEdges.push(...data.edges)
            }
          } catch { /* ignore */ }
        }
      }
    }
  }

  if (allNodes.length > 0) {
    loadGraphData({ nodes: allNodes, edges: allEdges })
  }
}

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(file)
  })
}

// ── Markdown Parser ───────────────────────────────────────────────
function parseMarkdown(text) {
  const nodes = []
  const edges = []
  let currentCategory = ''
  let currentTool = null
  let nodeIndex = 0

  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // H2 = category
    const h2Match = line.match(/^##\s+(.+)/)
    if (h2Match) {
      currentCategory = h2Match[1].replace(/[#*_]/g, '').trim()
      currentTool = null
      continue
    }

    // H3 = tool/item
    const h3Match = line.match(/^###\s+(.+)/)
    if (h3Match) {
      // Save previous tool if exists
      if (currentTool) {
        finalizeTool(currentTool, nodes, nodeIndex++)
      }
      currentTool = {
        label: h3Match[1].replace(/[*_]/g, '').trim(),
        category: currentCategory,
        url: '',
        issues: [],
        tags: [],
      }
      // Truncate long labels
      if (currentTool.label.length > 60) {
        currentTool.label = currentTool.label.substring(0, 57) + '...'
      }
      continue
    }

    // URL line
    if (currentTool) {
      const urlMatch = line.match(/\*\*URL:\*\*\s*<?([^>\s]+)>?/)
      if (urlMatch) {
        currentTool.url = urlMatch[1]
        continue
      }

      // Issues line
      const issueMatch = line.match(/\*\*Issues?:\*\*\s*(.+)/)
      if (issueMatch) {
        const nums = issueMatch[1].match(/#(\d+)/g)
        if (nums) {
          currentTool.issues = nums.map(n => parseInt(n.replace('#', '')))
        }
        continue
      }

      // Also check for bare URLs
      const bareUrlMatch = line.match(/^(https?:\/\/[^\s]+)/)
      if (bareUrlMatch && !currentTool.url) {
        currentTool.url = bareUrlMatch[1]
        continue
      }

      // Check for markdown links
      const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      if (linkMatch && !currentTool.url) {
        currentTool.url = linkMatch[2]
        continue
      }
    }
  }

  // Save last tool
  if (currentTool) {
    finalizeTool(currentTool, nodes, nodeIndex++)
  }

  // Generate edges: connect tools in same category sequentially
  const byCategory = new Map()
  for (const node of nodes) {
    if (!byCategory.has(node.category)) byCategory.set(node.category, [])
    byCategory.get(node.category).push(node)
  }
  for (const [cat, catNodes] of byCategory) {
    for (let i = 0; i < catNodes.length - 1; i++) {
      edges.push({
        source: catNodes[i].id,
        target: catNodes[i + 1].id,
        label: cat || 'related',
      })
    }
  }

  // Also generate edges based on URL domain similarity
  const domainGroups = new Map()
  for (const node of nodes) {
    if (!node.url) continue
    try {
      const hostname = new URL(node.url).hostname.replace('www.', '')
      const domain = hostname.split('.').slice(-2).join('.')
      if (!domainGroups.has(domain)) domainGroups.set(domain, [])
      domainGroups.get(domain).push(node)
    } catch { /* ignore */ }
  }
  for (const [domain, domainNodes] of domainGroups) {
    if (domainNodes.length < 2 || domainNodes.length > 20) continue
    for (let i = 0; i < domainNodes.length - 1; i++) {
      edges.push({
        source: domainNodes[i].id,
        target: domainNodes[i + 1].id,
        label: domain,
      })
    }
  }

  return { nodes, edges }
}

function finalizeTool(tool, nodes, index) {
  const angle = index * 2.4
  const radius = 100 + index * 30
  nodes.push({
    id: 'md_' + index,
    label: tool.label,
    desc: tool.desc || '',
    url: tool.url || '',
    category: tool.category || '',
    issues: tool.issues || [],
    tags: tool.tags || [],
    x: Math.cos(angle) * radius + 600,
    y: Math.sin(angle) * radius + 400,
    vx: 0,
    vy: 0,
  })
}

function loadGraphData(data) {
  if (!data || !Array.isArray(data.nodes)) return

  setFilter(null)
  document.getElementById('search-bar').value = ''

  preparedNodeCache.clear()
  preparedEdgeCache.clear()
  nodeSizeCache.clear()
  panelTextCache.clear()

  const newNodes = data.nodes.map((n, i) => {
    const angle = i * 2.4
    const radius = 150 + i * 40
    return {
      id: String(n.id || 'n_' + i),
      label: String(n.label || n.id || 'Node'),
      desc: n.desc || '',
      url: n.url || '',
      category: n.category || '',
      issues: n.issues || [],
      tags: n.tags || [],
      x: n.x != null ? Number(n.x) : Math.cos(angle) * radius + 600,
      y: n.y != null ? Number(n.y) : Math.sin(angle) * radius + 400,
      vx: 0,
      vy: 0,
    }
  })

  const nodeIds = new Set(newNodes.map(n => n.id))
  const newEdges = (data.edges || [])
    .filter(e => nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
    .map(e => ({
      source: String(e.source),
      target: String(e.target),
      label: String(e.label || ''),
    }))

  nodes.length = 0
  nodes.push(...newNodes)
  edges.length = 0
  edges.push(...newEdges)

  selectedNodeId = null
  panelScrollY = 0
  centerCamera()
  wakeSimulation()
  needsRender = true
  needsPanelRender = true
}

function exportGraph() {
  const data = {
    nodes: nodes.map(n => ({
      id: n.id,
      label: n.label,
      url: n.url || undefined,
      category: n.category || undefined,
      issues: n.issues && n.issues.length ? n.issues : undefined,
      tags: n.tags && n.tags.length ? n.tags : undefined,
      x: Math.round(n.x),
      y: Math.round(n.y),
    })),
    edges: edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'knowledge-graph.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Input Handling ────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const world = screenToWorld(sx, sy)

  // Check legend click first (screen-space)
  for (const region of legendHitRegions) {
    if (sx >= region.x && sx <= region.x + region.w && sy >= region.y && sy <= region.y + region.h) {
      // Toggle: click active category to clear, click new one to switch
      if (activeFilter && activeFilter.type === 'category' && activeFilter.value === region.category) {
        setFilter(null)
      } else {
        document.getElementById('search-bar').value = ''
        setFilter({ type: 'category', value: region.category })
      }
      return
    }
  }

  // Check octopus first (it renders on top)
  if (hitTestOctopus(world.x, world.y)) {
    octo.isDragging = true
    octo.dragOffsetX = world.x - octo.x
    octo.dragOffsetY = world.y - octo.y
    canvas.classList.add('grabbing')
    wakeSimulation()
    needsRender = true
    return
  }

  const hit = hitTestNode(world.x, world.y)

  if (hit) {
    draggingNode = hit
    draggingNode._dragOffsetX = world.x - hit.x
    draggingNode._dragOffsetY = world.y - hit.y
    draggingNode.vx = 0
    draggingNode.vy = 0
    canvas.classList.add('grabbing')
    wakeSimulation()

    selectedNodeId = hit.id
    panelScrollY = 0
    needsPanelRender = true
    needsRender = true
  } else {
    isPanning = true
    panStart = { x: sx, y: sy }
    panCameraStart = { x: camera.x, y: camera.y }
    canvas.classList.add('grabbing')

    selectedNodeId = null
    panelScrollY = 0
    needsPanelRender = true
    needsRender = true
  }
})

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const world = screenToWorld(sx, sy)

  if (octo.isDragging) {
    const newX = world.x - octo.dragOffsetX
    const newY = world.y - octo.dragOffsetY
    // Face direction of drag
    if (newX < octo.x - 1) octo.facingLeft = true
    else if (newX > octo.x + 1) octo.facingLeft = false
    octo.x = newX
    octo.y = newY
    wakeSimulation()
    needsRender = true
    return
  }

  if (draggingNode) {
    draggingNode.x = world.x - draggingNode._dragOffsetX
    draggingNode.y = world.y - draggingNode._dragOffsetY
    draggingNode.vx = 0
    draggingNode.vy = 0
    wakeSimulation()
    needsRender = true
  } else if (isPanning) {
    camera.x = panCameraStart.x + (sx - panStart.x)
    camera.y = panCameraStart.y + (sy - panStart.y)
    needsRender = true
  } else {
    // Legend hover (screen-space)
    let newLegendHover = null
    for (const region of legendHitRegions) {
      if (sx >= region.x && sx <= region.x + region.w && sy >= region.y && sy <= region.y + region.h) {
        newLegendHover = region.category
        break
      }
    }
    if (newLegendHover !== hoveredLegendCat) {
      hoveredLegendCat = newLegendHover
      needsRender = true
    }

    const hit = hitTestNode(world.x, world.y)
    const newHoveredId = hit ? hit.id : null
    const overOcto = hitTestOctopus(world.x, world.y)
    if (newHoveredId !== hoveredNodeId || overOcto) {
      hoveredNodeId = newHoveredId
      needsRender = true
    }
    canvas.style.cursor = (hoveredNodeId || overOcto || newLegendHover) ? 'pointer' : 'grab'
  }
})

canvas.addEventListener('mouseup', () => {
  octo.isDragging = false
  if (draggingNode) wakeSimulation()
  draggingNode = null
  isPanning = false
  canvas.classList.remove('grabbing')
  if (!hoveredNodeId) canvas.style.cursor = 'grab'
})

canvas.addEventListener('mouseleave', () => {
  octo.isDragging = false
  if (draggingNode) wakeSimulation()
  draggingNode = null
  isPanning = false
  canvas.classList.remove('grabbing')
  if (hoveredNodeId) {
    hoveredNodeId = null
    needsRender = true
  }
})

// Double-click: open URL if node has one, otherwise add new node
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const world = screenToWorld(sx, sy)
  const hit = hitTestNode(world.x, world.y)

  if (hit) {
    if (hit.url) {
      window.open(hit.url, '_blank')
    }
  } else {
    const label = prompt('Enter node label:')
    if (label && label.trim()) {
      const sanitized = label.trim()
      const id = 'node_' + Date.now()
      nodes.push({ id, label: sanitized, url: '', category: '', issues: [], tags: [], x: world.x, y: world.y, vx: 0, vy: 0 })
      getPreparedNode(sanitized)
      selectedNodeId = id
      wakeSimulation()
      needsPanelRender = true
      needsRender = true
    }
  }
})

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top

  const zoomFactor = e.deltaY < 0 ? 1.08 : 1 / 1.08
  const newZoom = Math.max(0.05, Math.min(5, camera.zoom * zoomFactor))

  camera.x = sx - (sx - camera.x) * (newZoom / camera.zoom)
  camera.y = sy - (sy - camera.y) * (newZoom / camera.zoom)
  camera.zoom = newZoom
  needsRender = true
}, { passive: false })

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return

    if (selectedNodeId) {
      const idx = nodes.findIndex(n => n.id === selectedNodeId)
      if (idx !== -1) {
        nodes.splice(idx, 1)
        for (let i = edges.length - 1; i >= 0; i--) {
          if (edges[i].source === selectedNodeId || edges[i].target === selectedNodeId) {
            edges.splice(i, 1)
          }
        }
        selectedNodeId = null
        wakeSimulation()
        needsPanelRender = true
        needsRender = true
      }
    }
  }

  // Escape clears filter
  if (e.key === 'Escape') {
    const searchBar = document.getElementById('search-bar')
    if (activeFilter) {
      setFilter(null)
      searchBar.value = ''
      searchBar.blur()
    } else {
      searchBar.blur()
    }
  }
})

// ── Search Bar ────────────────────────────────────────────────────
const searchBar = document.getElementById('search-bar')
const filterBadge = document.getElementById('filter-badge')

searchBar.addEventListener('keydown', (e) => {
  e.stopPropagation() // don't trigger delete/backspace node removal
  if (e.key === 'Enter') {
    const q = searchBar.value.trim()
    if (q) {
      setFilter({ type: 'search', value: q })
    } else {
      setFilter(null)
    }
    searchBar.blur()
  }
})

// Clicking the badge clears the filter
filterBadge.addEventListener('click', () => {
  setFilter(null)
  searchBar.value = ''
})

// ── Initial camera ────────────────────────────────────────────────
function centerCamera() {
  if (nodes.length === 0) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const node of nodes) {
    const size = computeNodeSize(node)
    minX = Math.min(minX, node.x - size.width / 2)
    maxX = Math.max(maxX, node.x + size.width / 2)
    minY = Math.min(minY, node.y - size.height / 2)
    maxY = Math.max(maxY, node.y + size.height / 2)
  }
  const graphW = maxX - minX
  const graphH = maxY - minY
  const graphCX = (minX + maxX) / 2
  const graphCY = (minY + maxY) / 2

  const padding = 80
  const scaleX = (width - padding * 2) / graphW
  const scaleY = (height - padding * 2) / graphH
  camera.zoom = Math.min(scaleX, scaleY, 1.5)
  camera.x = width / 2 - graphCX * camera.zoom
  camera.y = height / 2 - graphCY * camera.zoom
  needsRender = true
}

document.fonts.ready.then(() => {
  clearCache()
  preparedNodeCache.clear()
  preparedEdgeCache.clear()
  nodeSizeCache.clear()
  panelTextCache.clear()
  centerCamera()
  wakeSimulation()
  needsRender = true
  needsPanelRender = true
})
