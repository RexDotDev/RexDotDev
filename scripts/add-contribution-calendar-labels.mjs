import { readFile, writeFile } from 'node:fs/promises';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const options = {
  reference: null,
  snake: [],
  threeD: [],
};

for (let index = 2; index < process.argv.length; index += 1) {
  const option = process.argv[index];
  const value = process.argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}.`);
  }

  if (option === '--reference') {
    options.reference = value;
  } else if (option === '--snake') {
    options.snake.push(value);
  } else if (option === '--three-d') {
    options.threeD.push(value);
  } else {
    throw new Error(`Unknown option ${option}.`);
  }

  index += 1;
}

if (!options.reference || options.snake.length === 0 || options.threeD.length === 0) {
  throw new Error(
    'Pass --reference, at least one --snake file and at least one --three-d file.',
  );
}

const formatNumber = (value) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const parseDate = (value) => new Date(`${value}T00:00:00Z`);

const daysBetween = (start, end) =>
  Math.round((end.getTime() - start.getTime()) / DAY_MS);

const getDateRange = (svg) => {
  const match = svg.match(/>(\d{4}-\d{2}-\d{2}) \/ (\d{4}-\d{2}-\d{2})<\/text>/);

  if (!match) {
    throw new Error('Could not find the contribution date range in the reference SVG.');
  }

  const start = parseDate(match[1]);
  const end = parseDate(match[2]);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end ||
    start.getUTCDay() !== 0
  ) {
    throw new Error('The contribution date range is invalid or does not start on Sunday.');
  }

  return { start, end };
};

const getMonthMarkers = (start, end) => {
  const markers = [{ date: start, label: MONTHS[start.getUTCMonth()] }];
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );

  while (cursor <= end) {
    markers.push({ date: cursor, label: MONTHS[cursor.getUTCMonth()] });
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }

  return markers;
};

const removeCalendarLabels = (svg) =>
  svg
    .replace(/<g id="calendar-axis-labels"[^>]*>.*?<\/g>/s, '')
    .replace(/\.calendar-label\{[^}]*\}/g, '');

const getThreeDCells = (svg) => {
  const cells = [];
  const pattern =
    /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">((?:<animateTransform\b[^>]*><\/animateTransform>)?)(?=<rect stroke="none")/g;

  for (const match of svg.matchAll(pattern)) {
    let x = Number(match[1]);
    let y = Number(match[2]);
    const values = match[3].match(/\bvalues="([^"]+)"/)?.[1];

    if (values) {
      const base = values
        .split(';')[0]
        .match(/^(-?[\d.]+) (-?[\d.]+)$/);

      if (!base) {
        throw new Error('Could not read the base position of a 3D contribution cell.');
      }

      x = Number(base[1]);
      y = Number(base[2]);
    }

    cells.push({ x, y });
  }

  return cells;
};

const addThreeDLabels = (svg, start, end, file) => {
  let clean = removeCalendarLabels(svg);
  const chartHeight = 880;
  const rootPattern =
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1280" height="(?:850|880)" viewBox="0 0 1280 (?:850|880)">/;
  const backgroundPattern =
    /<rect x="0" y="0" width="1280" height="(?:850|880)" class="fill-bg"><\/rect>/;

  if (!rootPattern.test(clean) || !backgroundPattern.test(clean)) {
    throw new Error(`Could not expand the 3D chart canvas in ${file}.`);
  }

  clean = clean
    .replace(
      rootPattern,
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${chartHeight}" viewBox="0 0 1280 ${chartHeight}">`,
    )
    .replace(
      backgroundPattern,
      `<rect x="0" y="0" width="1280" height="${chartHeight}" class="fill-bg"></rect>`,
    );

  const cells = getThreeDCells(clean);
  const expectedCellCount = daysBetween(start, end) + 1;

  if (cells.length !== expectedCellCount) {
    throw new Error(
      `Expected ${expectedCellCount} 3D contribution cells in ${file}, found ${cells.length}.`,
    );
  }

  const dayStep = {
    x: cells[1].x - cells[0].x,
    y: cells[1].y - cells[0].y,
  };
  const monthLabels = getMonthMarkers(start, end)
    .map(({ date, label }) => {
      const weekIndex = Math.floor(daysBetween(start, date) / 7);
      const topCell = cells[weekIndex * 7];
      const bottomEdge = {
        x: topCell.x + dayStep.x * 6,
        y: topCell.y + dayStep.y * 6,
      };
      const x = bottomEdge.x - 14;
      const y = bottomEdge.y + 30;

      return `<text class="fill-weak stroke-bg" x="${formatNumber(x)}" y="${formatNumber(y)}" text-anchor="start" transform="rotate(30 ${formatNumber(x)} ${formatNumber(y)})">${label}</text>`;
    })
    .join('');
  const weekdayLabels = [
    [1, 'Mon'],
    [3, 'Wed'],
    [5, 'Fri'],
  ]
    .map(([dayIndex, label]) => {
      const cell = cells[dayIndex];
      const x = cell.x - 14;
      const y = cell.y - 8;

      return `<text class="fill-weak stroke-bg" x="${formatNumber(x)}" y="${formatNumber(y)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-30 ${formatNumber(x)} ${formatNumber(y)})">${label}</text>`;
    })
    .join('');
  const labels = `<g id="calendar-axis-labels" aria-hidden="true" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:500;letter-spacing:.2px;paint-order:stroke;stroke-width:3px;stroke-linejoin:round;pointer-events:none">${monthLabels}${weekdayLabels}</g>`;
  const radarPattern = /<g transform="translate\(-?[\d.]+, -?[\d.]+\)">/;

  if (!radarPattern.test(clean)) {
    throw new Error(`Could not find the chart following the 3D grid in ${file}.`);
  }

  return clean.replace(radarPattern, (radar) => `${labels}${radar}`);
};

const addSnakeLabels = (svg, start, end, file) => {
  let clean = removeCalendarLabels(svg);
  const cellRule = clean.match(/\.c\{([^}]*)\}/)?.[1];
  const cellWidth = Number(cellRule?.match(/(?:^|;)width:([\d.]+)px/)?.[1]);
  const cellHeight = Number(cellRule?.match(/(?:^|;)height:([\d.]+)px/)?.[1]);
  const cells = [
    ...clean.matchAll(
      /<rect class="c(?: [^"]*)?" x="(-?[\d.]+)" y="(-?[\d.]+)"/g,
    ),
  ];

  if (!cellWidth || !cellHeight || cells.length === 0) {
    throw new Error(`Could not determine the snake contribution grid in ${file}.`);
  }

  const xValues = [
    ...new Set(cells.map((match) => Number(match[1]))),
  ].sort((a, b) => a - b);
  const yValues = [
    ...new Set(cells.map((match) => Number(match[2]))),
  ].sort((a, b) => a - b);
  const expectedWeekCount = Math.floor(daysBetween(start, end) / 7) + 1;

  if (xValues.length !== expectedWeekCount || yValues.length !== 7) {
    throw new Error(
      `Expected a ${expectedWeekCount} by 7 snake grid in ${file}, found ${xValues.length} by ${yValues.length}.`,
    );
  }

  const padding = 2;
  const gridMinX = Math.min(...xValues) - padding;
  const gridMinY = Math.min(...yValues) - padding;
  const gridMaxX = Math.max(...xValues) + cellWidth + padding;
  const gridMaxY = Math.max(...yValues) + cellHeight + padding;
  const leftGutter = 34;
  const topGutter = 22;
  const viewMinX = gridMinX - leftGutter;
  const viewMinY = gridMinY - topGutter;
  const viewWidth = gridMaxX - viewMinX;
  const viewHeight = gridMaxY - viewMinY;
  const rootPattern =
    /^<svg viewBox="[^"]+" width="[^"]+" height="[^"]+"(?: overflow="[^"]+")?/;

  if (!rootPattern.test(clean) || !clean.includes('</style>')) {
    throw new Error(`Could not update the snake SVG viewport or styles in ${file}.`);
  }

  clean = clean.replace(
    rootPattern,
    `<svg viewBox="${formatNumber(viewMinX)} ${formatNumber(viewMinY)} ${formatNumber(viewWidth)} ${formatNumber(viewHeight)}" width="${formatNumber(viewWidth)}" height="${formatNumber(viewHeight)}" overflow="hidden"`,
  );

  const labelColor = file.toLowerCase().includes('dark') ? '#8b949e' : '#57606a';
  clean = clean.replace(
    '</style>',
    `.calendar-label{fill:${labelColor};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:10px;font-weight:400}</style>`,
  );

  const monthLabels = getMonthMarkers(start, end)
    .map(({ date, label }) => {
      const weekIndex = Math.floor(daysBetween(start, date) / 7);
      return `<text class="calendar-label" x="${formatNumber(xValues[weekIndex])}" y="${formatNumber(gridMinY - 7)}">${label}</text>`;
    })
    .join('');
  const weekdayLabels = [
    [1, 'Mon'],
    [3, 'Wed'],
    [5, 'Fri'],
  ]
    .map(
      ([dayIndex, label]) =>
        `<text class="calendar-label" x="${formatNumber(gridMinX - 6)}" y="${formatNumber(yValues[dayIndex] + cellHeight / 2)}" text-anchor="end" dominant-baseline="middle">${label}</text>`,
    )
    .join('');
  const labels = `<g id="calendar-axis-labels" aria-hidden="true" pointer-events="none">${monthLabels}${weekdayLabels}</g>`;

  return clean.replace('</svg>', `${labels}</svg>`);
};

const referenceSvg = await readFile(options.reference, 'utf8');
const { start, end } = getDateRange(referenceSvg);

for (const file of options.threeD) {
  const svg = await readFile(file, 'utf8');
  const labeled = addThreeDLabels(svg, start, end, file);
  await writeFile(file, labeled);
  console.log(`Added angled month and weekday labels to ${file}.`);
}

for (const file of options.snake) {
  const svg = await readFile(file, 'utf8');
  const labeled = addSnakeLabels(svg, start, end, file);
  await writeFile(file, labeled);
  console.log(`Added month and weekday labels to ${file}.`);
}
