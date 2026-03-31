/**
 * Determine if a color is dark based on relative luminance
 * @param hexColor Color in hex format (e.g., '#ffffff')
 * @returns true if dark (use white text), false if light (use dark text)
 */
export function isDarkColor(hexColor: string): boolean {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  // Calculate relative luminance
  const getLuminanceComponent = (c: number) => {
    if (c <= 0.03928) {
      return c / 12.92;
    }
    return Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLum = getLuminanceComponent(r);
  const gLum = getLuminanceComponent(g);
  const bLum = getLuminanceComponent(b);

  const luminance = 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;

  // If luminance is low, it's a dark color, use white text
  return luminance < 0.25;
}

/**
 * Get appropriate text color based on background color
 * @param bgColor Background color in hex format
 * @returns Text color: white for dark backgrounds, dark for light backgrounds
 */
export function getTextColorForBg(bgColor: string): string {
  return isDarkColor(bgColor) ? '#ffffff' : '#0f172a';
}
