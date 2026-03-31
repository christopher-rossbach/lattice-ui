/**
 * Export the graph as an SVG file
 * This creates a clean vector format suitable for LaTeX embedding
 * @param nodes Array of nodes with position and label
 * @param edges Array of edges connecting nodes
 * @returns SVG content as string
 */
import { getTextColorForBg } from './colorUtils';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?inline';

/**
 * Render LaTeX math in text labels for SVG export
 * Converts $...$ to rendered math notation using KaTeX as MathML
 */
function renderMathForSVG(text: string, textColor: string): string {
  try {
    if (text.includes('$')) {
      // Render LaTeX math to MathML using KaTeX (better for SVG/PDF)
      const rendered = text.replace(/\$([^$]+)\$/g, (match, math) => {
        try {
          return katex.renderToString(math, { 
            throwOnError: false, 
            displayMode: false,
            output: 'mathml'
          });
        } catch {
          return math;
        }
      });
      return rendered;
    }
    return escapeHtml(text);
  } catch {
    return escapeHtml(text);
  }
}

export function generateGraphSVG(
  nodes: Array<{ id: string; x: number; y: number; label: string; color?: string }>,
  edges: Array<{ source: string; target: string }>
): string {
  const NODE_RADIUS = 36;
  const PADDING = 2;

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x - NODE_RADIUS);
    maxX = Math.max(maxX, node.x + NODE_RADIUS);
    minY = Math.min(minY, node.y - NODE_RADIUS);
    maxY = Math.max(maxY, node.y + NODE_RADIUS);
  });

  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;

  // Start SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:math="http://www.w3.org/1998/Math/MathML" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .node-circle { fill: white; stroke: #0f172a; stroke-width: 2; }
      .node-label { font-family: Arial, sans-serif; font-size: 12px; text-anchor: middle; dominant-baseline: middle; }
      .edge { stroke: #0f172a; stroke-width: 2; fill: none; }
      ${katexCss}
    </style>
  </defs>
  <g transform="translate(${PADDING - minX}, ${PADDING - minY})">
`;

  // Draw edges first (so they appear behind nodes)
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (sourceNode && targetNode) {
      svg += `    <line class="edge" x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" />\n`;
    }
  });

  // Draw nodes
  nodes.forEach((node) => {
    const color = node.color || '#ffffff';
    const textColor = getTextColorForBg(color);
    const renderedLabel = renderMathForSVG(node.label, textColor);
    svg += `    <circle class="node-circle" cx="${node.x}" cy="${node.y}" r="${NODE_RADIUS}" style="fill: ${color};" />\n`;
    
    // Use foreignObject for MathML/SVG content
    if (renderedLabel.includes('<')) {
      svg += `    <foreignObject x="${node.x - NODE_RADIUS}" y="${node.y - NODE_RADIUS}" width="${NODE_RADIUS * 2}" height="${NODE_RADIUS * 2}">\n`;
      svg += `      <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; font-family: Arial, sans-serif; font-size: 12px; color: ${textColor}; text-align: center; word-wrap: break-word; overflow: hidden;">\n`;
      svg += `        ${renderedLabel}\n`;
      svg += `      </div>\n`;
      svg += `    </foreignObject>\n`;
    } else {
      // Handle line breaks in plain text with tspan elements
      const lines = renderedLabel.split('\n');
      if (lines.length > 1) {
        svg += `    <text class="node-label" x="${node.x}" style="fill: ${textColor};">\n`;
        lines.forEach((line, i) => {
          const dy = (i - (lines.length - 1) / 2) * 1.2;
          svg += `      <tspan x="${node.x}" dy="${dy}em">${line}</tspan>\n`;
        });
        svg += `    </text>\n`;
      } else {
        svg += `    <text class="node-label" x="${node.x}" y="${node.y}" style="fill: ${textColor};">${renderedLabel}</text>\n`;
      }
    }
  });

  svg += `  </g>
</svg>`;

  return svg;
}

/**
 * Download SVG content as a file
 */
export function downloadSVG(svgContent: string, filename: string = 'lattice.svg'): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape HTML special characters for safe SVG embedding
 */
export function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
