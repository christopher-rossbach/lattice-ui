/**
 * Client-side API for server-side export
 */

const API_BASE = 'http://localhost:3001';

export interface ExportResponse {
  success: boolean;
  filename: string;
  path: string;
  message: string;
  error?: string;
}

/**
 * Export SVG to server file system
 */
export async function exportSVGToServer(filename: string, svgContent: string): Promise<ExportResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/export-svg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, svgContent }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      filename,
      path: '',
      message: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Export PDF to server file system
 * Sends SVG content which is converted to vector PDF on the server
 * @param filename File name (with or without .pdf extension)
 * @param svgContent SVG content as string
 */
export async function exportPDFToServer(filename: string, svgContent: string): Promise<ExportResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, svgContent }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      filename,
      path: '',
      message: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get list of exported SVG files from server
 */
export async function getExportedFiles(): Promise<Array<{ name: string; path: string; size: number }>> {
  try {
    const response = await fetch(`${API_BASE}/api/exports`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Failed to fetch exported files:', error);
    return [];
  }
}
