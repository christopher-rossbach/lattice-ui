import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Exports directory - defaults to project root, can be configured
const EXPORTS_DIR = process.env.EXPORTS_DIR || path.join(__dirname, '../figures/graphs');

// Create exports directory if it doesn't exist
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// Enable CORS for all origins (or restrict to specific origin)
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'],
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

/**
 * POST /api/export-svg
 * Body: { filename: string, svgContent: string }
 * Saves SVG to file system
 */
app.post('/api/export-svg', (req, res) => {
  try {
    const { filename, svgContent } = req.body;

    if (!filename || !svgContent) {
      return res.status(400).json({ error: 'Missing filename or svgContent' });
    }

    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    const svgFileName = sanitized.endsWith('.svg') ? sanitized : `${sanitized}.svg`;
    const svgPath = path.join(EXPORTS_DIR, svgFileName);

    // Write the SVG file
    fs.writeFileSync(svgPath, svgContent, 'utf-8');
    console.log(`✓ SVG exported: ${svgPath}`);

    res.json({
      success: true,
      filename: svgFileName,
      path: svgPath,
      message: `Saved to ${path.relative(process.cwd(), svgPath)}`,
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/export-pdf
 * Body: { filename: string, svgContent: string }
 * Converts SVG to PDF using Puppeteer (renders SVG in browser, then converts)
 */
app.post('/api/export-pdf', async (req, res) => {
  let browser;
  try {
    const { filename, svgContent } = req.body;

    if (!filename || !svgContent) {
      return res.status(400).json({ error: 'Missing filename or svgContent' });
    }

    // Sanitize filename to prevent directory traversal
    const sanitized = path.basename(filename);
    const pdfFileName = sanitized.endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
    const pdfPath = path.join(EXPORTS_DIR, pdfFileName);
    
    try {
      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Create HTML wrapper with KaTeX CSS and the SVG
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 0; }
    svg { display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;
      
      // Set page content
      await page.setContent(html);
      
      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get SVG dimensions
      const svgDimensions = await page.evaluate(() => {
        const svg = document.querySelector('svg');
        return {
          width: svg.viewBox.baseVal.width || svg.width.baseVal.value,
          height: svg.viewBox.baseVal.height || svg.height.baseVal.value
        };
      });
      
      // Convert pixels to millimeters (assuming 96 DPI)
      const mmPerPx = 0.264583;
      const widthMm = svgDimensions.width * mmPerPx;
      const heightMm = svgDimensions.height * mmPerPx;
      
      // Generate PDF with exact dimensions
      await page.pdf({
        path: pdfPath,
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        margin: 0,
        printBackground: true
      });
      
      console.log(`✓ PDF exported: ${pdfPath}`);

      res.json({
        success: true,
        filename: pdfFileName,
        path: pdfPath,
        message: `Saved to ${path.relative(process.cwd(), pdfPath)}`,
      });
    } catch (conversionError) {
      console.error('SVG to PDF conversion error:', conversionError.message);
      res.status(500).json({ error: `Conversion failed: ${conversionError.message}` });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports
 * Returns list of exported PDF files (and SVG)
 */
app.get('/api/exports', (req, res) => {
  try {
    const files = fs.readdirSync(EXPORTS_DIR)
      .filter(f => f.endsWith('.pdf') || f.endsWith('.svg'))
      .map(f => ({
        name: f,
        path: path.join(EXPORTS_DIR, f),
        size: fs.statSync(path.join(EXPORTS_DIR, f)).size,
        type: f.endsWith('.pdf') ? 'pdf' : 'svg',
      }));

    res.json({ files, directory: EXPORTS_DIR });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Export server running at http://localhost:${PORT}`);
  console.log(`📁 Exports directory: ${path.relative(process.cwd(), EXPORTS_DIR)}\n`);
});
