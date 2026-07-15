import { readFile, writeFile } from 'node:fs/promises';

const files = process.argv.slice(2);

if (files.length === 0) {
  throw new Error('Pass at least one generated snake SVG to crop.');
}

const formatNumber = (value) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

for (const file of files) {
  const svg = await readFile(file, 'utf8');
  const cellRule = svg.match(/\.c\{([^}]*)\}/)?.[1];
  const cellWidth = Number(cellRule?.match(/(?:^|;)width:([\d.]+)px/)?.[1]);
  const cellHeight = Number(cellRule?.match(/(?:^|;)height:([\d.]+)px/)?.[1]);
  const cells = [
    ...svg.matchAll(
      /<rect class="c(?: [^"]*)?" x="(-?[\d.]+)" y="(-?[\d.]+)"/g,
    ),
  ];

  if (!cellWidth || !cellHeight || cells.length === 0) {
    throw new Error(`Could not determine the contribution grid bounds in ${file}.`);
  }

  const xValues = cells.map((match) => Number(match[1]));
  const yValues = cells.map((match) => Number(match[2]));
  const padding = 2;
  const minX = Math.min(...xValues) - padding;
  const minY = Math.min(...yValues) - padding;
  const maxX = Math.max(...xValues) + cellWidth + padding;
  const maxY = Math.max(...yValues) + cellHeight + padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const root = `<svg viewBox="${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}" width="${formatNumber(width)}" height="${formatNumber(height)}" overflow="hidden"`;
  const rootPattern =
    /^<svg viewBox="[^"]+" width="[^"]+" height="[^"]+"(?: overflow="[^"]+")?/;

  if (!rootPattern.test(svg)) {
    throw new Error(`Could not update the SVG viewport in ${file}.`);
  }

  const cropped = svg.replace(rootPattern, root);

  if (cropped !== svg) {
    await writeFile(file, cropped);
  }
  console.log(`Cropped ${file} to ${formatNumber(width)}×${formatNumber(height)}.`);
}
