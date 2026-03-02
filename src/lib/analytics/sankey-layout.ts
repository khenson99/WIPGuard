export interface PathData {
  stages: string[];
  count: number;
  value?: number;
}

export interface SankeyConfig {
  width: number;
  height: number;
  nodeWidth: number;
  nodePadding: number;
  topN: number;
}

export interface SankeyNode {
  id: string;
  label: string;
  column: number;
  x: number;
  y: number;
  height: number;
  totalFlow: number;
}

export interface SankeyLink {
  id: string;
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  value: number;
  sourceY: number;
  targetY: number;
  path: string;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalFlow: number;
}

export function computeSankeyLayout(
  paths: PathData[],
  config: SankeyConfig,
): SankeyLayout {
  const { width, height, nodeWidth, nodePadding, topN } = config;

  if (!paths.length) return { nodes: [], links: [], totalFlow: 0 };

  // Take top N paths by count
  const topPaths = [...paths].sort((a, b) => b.count - a.count).slice(0, topN);

  // Find max path length (number of columns)
  const maxCols = Math.max(...topPaths.map((p) => p.stages.length));
  if (maxCols < 2) return { nodes: [], links: [], totalFlow: 0 };

  // Build node map: key = "stageName|column"
  const nodeMap = new Map<string, { totalFlow: number; column: number; label: string }>();

  for (const path of topPaths) {
    for (let col = 0; col < path.stages.length; col++) {
      const key = `${path.stages[col]}|${col}`;
      const existing = nodeMap.get(key) ?? { totalFlow: 0, column: col, label: path.stages[col] };
      existing.totalFlow += path.count;
      nodeMap.set(key, existing);
    }
  }

  // Group nodes by column to compute vertical positions
  const byColumn = new Map<number, Array<{ key: string; totalFlow: number; label: string }>>();
  for (const [key, node] of nodeMap) {
    const col = node.column;
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col)!.push({ key, totalFlow: node.totalFlow, label: node.label });
  }

  const totalFlow = topPaths.reduce((sum, p) => sum + p.count, 0);
  const availableHeight = height - nodePadding * (maxCols - 1);

  // Assign x/y positions to nodes
  const nodes: SankeyNode[] = [];
  const nodePositions = new Map<string, SankeyNode>();

  for (let col = 0; col < maxCols; col++) {
    const colNodes = byColumn.get(col) ?? [];
    const colTotal = colNodes.reduce((sum, n) => sum + n.totalFlow, 0);

    // X position: evenly spaced across width
    const x = maxCols === 1 ? 0 : col * ((width - nodeWidth) / (maxCols - 1));

    // Distribute node heights proportionally to their flow
    const totalNodeHeight = availableHeight * (colTotal / totalFlow);
    const nodeCount = colNodes.length;
    const totalPadding = nodePadding * (nodeCount - 1);
    const netHeight = Math.max(totalNodeHeight - totalPadding, nodeCount * 10);

    let yOffset = (height - netHeight - totalPadding) / 2;

    // Sort nodes by flow descending for stable layout
    colNodes.sort((a, b) => b.totalFlow - a.totalFlow);

    for (const colNode of colNodes) {
      const nodeHeight = Math.max((colNode.totalFlow / colTotal) * netHeight, 10);
      const node: SankeyNode = {
        id: colNode.key,
        label: colNode.label,
        column: col,
        x,
        y: yOffset,
        height: nodeHeight,
        totalFlow: colNode.totalFlow,
      };
      nodes.push(node);
      nodePositions.set(colNode.key, node);
      yOffset += nodeHeight + nodePadding;
    }
  }

  // Build links between consecutive stage pairs
  const linkMap = new Map<string, { value: number; sourceId: string; targetId: string; sourceLabel: string; targetLabel: string }>();

  for (const path of topPaths) {
    for (let i = 0; i < path.stages.length - 1; i++) {
      const srcKey = `${path.stages[i]}|${i}`;
      const tgtKey = `${path.stages[i + 1]}|${i + 1}`;
      const linkKey = `${srcKey}→${tgtKey}`;
      const existing = linkMap.get(linkKey) ?? { value: 0, sourceId: srcKey, targetId: tgtKey, sourceLabel: path.stages[i], targetLabel: path.stages[i + 1] };
      existing.value += path.count;
      linkMap.set(linkKey, existing);
    }
  }

  // Track used offsets on each node for link positioning
  const sourceOffsets = new Map<string, number>();
  const targetOffsets = new Map<string, number>();

  const links: SankeyLink[] = [];
  for (const [linkKey, link] of linkMap) {
    const srcNode = nodePositions.get(link.sourceId);
    const tgtNode = nodePositions.get(link.targetId);
    if (!srcNode || !tgtNode) continue;

    const srcOffset = sourceOffsets.get(link.sourceId) ?? 0;
    const tgtOffset = targetOffsets.get(link.targetId) ?? 0;

    const linkHeight = Math.max((link.value / srcNode.totalFlow) * srcNode.height, 2);

    const sourceY = srcNode.y + srcOffset;
    const targetY = tgtNode.y + tgtOffset;

    sourceOffsets.set(link.sourceId, srcOffset + linkHeight);
    targetOffsets.set(link.targetId, tgtOffset + linkHeight);

    links.push({
      id: linkKey,
      sourceId: link.sourceId,
      targetId: link.targetId,
      sourceLabel: link.sourceLabel,
      targetLabel: link.targetLabel,
      value: link.value,
      sourceY,
      targetY,
      path: buildLinkPath(srcNode.x, sourceY, linkHeight, tgtNode.x, targetY, linkHeight, nodeWidth),
    });
  }

  return { nodes, links, totalFlow };
}

function buildLinkPath(
  sx: number,
  sy: number,
  sh: number,
  tx: number,
  ty: number,
  th: number,
  nodeWidth: number,
): string {
  const x0 = sx + nodeWidth;
  const x1 = tx;
  const xi = (x0 + x1) / 2;
  const y0top = sy;
  const y0bot = sy + sh;
  const y1top = ty;
  const y1bot = ty + th;
  return [
    `M${x0},${y0top}`,
    `C${xi},${y0top} ${xi},${y1top} ${x1},${y1top}`,
    `L${x1},${y1bot}`,
    `C${xi},${y1bot} ${xi},${y0bot} ${x0},${y0bot}`,
    "Z",
  ].join(" ");
}
