import { readFile, writeFile } from 'node:fs/promises';

const files = process.argv.slice(2);

if (files.length === 0) {
  throw new Error('Pass at least one generated snake SVG to crop.');
}

const formatNumber = (value) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const formatPercentage = (value) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getGridStep = (values) => {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const steps = sorted.slice(1).map((value, index) => value - sorted[index]);
  return Math.min(...steps.filter((step) => step > 0));
};

const getSnakeFrames = (svg, segment) => {
  const animation = svg.match(
    new RegExp(`@keyframes s${segment}\\{(.*?)\\}\\.s\\.s${segment}\\{`, 's'),
  )?.[1];

  if (!animation) {
    throw new Error(`Could not find snake segment s${segment}.`);
  }

  const framesByTime = new Map();
  const framePattern =
    /([^{}]+)\{transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\)\}/g;

  for (const match of animation.matchAll(framePattern)) {
    for (const selector of match[1].split(',')) {
      framesByTime.set(Number(selector.replace('%', '')), {
        time: Number(selector.replace('%', '')),
        x: Number(match[2]),
        y: Number(match[3]),
      });
    }
  }

  const frames = [...framesByTime.values()].sort((a, b) => a.time - b.time);

  if (frames.length < 2 || frames.some(({ time }) => !Number.isFinite(time))) {
    throw new Error(`Could not parse snake segment s${segment}.`);
  }

  return frames;
};

const buildClosedSnakePath = (svg, stepX, stepY) => {
  const frames = getSnakeFrames(svg, 0);
  const path = [{ x: frames[0].x, y: frames[0].y }];

  for (let index = 0; index < frames.length - 1; index += 1) {
    const start = frames[index];
    const end = frames[index + 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;

    if (deltaX === 0 && deltaY === 0) {
      continue;
    }

    if (deltaX !== 0 && deltaY !== 0) {
      throw new Error('The constrained snake path contains a diagonal move.');
    }

    const steps = Math.abs(deltaX / stepX) + Math.abs(deltaY / stepY);

    if (!Number.isInteger(steps)) {
      throw new Error('The constrained snake path is not aligned to the contribution grid.');
    }

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      path.push({
        x: start.x + deltaX * progress,
        y: start.y + deltaY * progress,
      });
    }
  }

  const first = path[0];
  const last = path.at(-1);

  if (first.x !== last.x || first.y !== last.y) {
    throw new Error('The constrained snake path is not a closed loop.');
  }

  return path;
};

const smoothSnakeAnimations = (svg, stepX, stepY) => {
  const path = buildClosedSnakePath(svg, stepX, stepY);
  const edgeCount = path.length - 1;
  const durationMs = edgeCount * 100;
  let smoothed = svg;
  let keyframeCount = 0;

  for (let segment = 0; segment < 4; segment += 1) {
    const groups = new Map();
    const getPosition = (step) =>
      path[(step - segment + edgeCount) % edgeCount];
    const keyframeSteps = [0];

    for (let step = 1; step < edgeCount; step += 1) {
      const previous = getPosition(step - 1);
      const current = getPosition(step);
      const next = getPosition(step + 1);
      const incomingX = current.x - previous.x;
      const incomingY = current.y - previous.y;
      const outgoingX = next.x - current.x;
      const outgoingY = next.y - current.y;

      if (incomingX !== outgoingX || incomingY !== outgoingY) {
        keyframeSteps.push(step);
      }
    }
    keyframeSteps.push(edgeCount);
    keyframeCount += keyframeSteps.length;

    for (const step of keyframeSteps) {
      const position = getPosition(step);
      const key = `${formatNumber(position.x)},${formatNumber(position.y)}`;
      const time = step === edgeCount ? 100 : (step / edgeCount) * 100;

      if (!groups.has(key)) {
        groups.set(key, { ...position, times: [] });
      }
      groups.get(key).times.push(formatPercentage(time));
    }

    const keyframes = [...groups.values()]
      .map(
        ({ x, y, times }) =>
          `${times.map((time) => `${time}%`).join(',')}{transform:translate(${formatNumber(x)}px,${formatNumber(y)}px)}`,
      )
      .join('');
    const animationPattern = new RegExp(
      `@keyframes s${segment}\\{.*?\\}(?=\\.s\\.s${segment}\\{)`,
      's',
    );
    const initial = path[(edgeCount - segment) % edgeCount];
    const initialPattern = new RegExp(
      `\\.s\\.s${segment}\\{transform:translate\\([^)]*\\);animation-name:s${segment}\\}`,
    );

    if (!animationPattern.test(smoothed) || !initialPattern.test(smoothed)) {
      throw new Error(`Could not rebuild snake segment s${segment}.`);
    }

    smoothed = smoothed
      .replace(animationPattern, `@keyframes s${segment}{${keyframes}}`)
      .replace(
        initialPattern,
        `.s.s${segment}{transform:translate(${formatNumber(initial.x)}px,${formatNumber(initial.y)}px);animation-name:s${segment}}`,
      );
  }

  smoothed = smoothed
    .replace(
      /animation:none \d+ms linear infinite/g,
      `animation:none ${durationMs}ms linear infinite`,
    )
    .replace(
      /animation:none linear \d+ms infinite/g,
      `animation:none linear ${durationMs}ms infinite`,
    );

  return { svg: smoothed, path, edgeCount, durationMs, keyframeCount };
};

const removeHiddenProgressAnimation = (svg) => {
  const progressElements = [
    ...svg.matchAll(/<rect class="u(?: [^"]*)?"[^>]*\/>/g),
  ];
  const withoutElements = svg.replace(
    /<rect class="u(?: [^"]*)?"[^>]*\/>/g,
    '',
  );
  const withoutCss = withoutElements.replace(/\.u\{.*?(?=\.s\{)/s, '');

  return { svg: withoutCss, removedCount: progressElements.length };
};

const replaceCellAnimationsWithPath = (
  svg,
  path,
  edgeCount,
  durationMs,
  cellWidth,
  width,
  height,
) => {
  if (svg.includes('<defs id="cell-consumption-animation">')) {
    const filledCellCount = [
      ...svg.matchAll(/<rect class="c l[1-4]"/g),
    ].length;

    if (filledCellCount === 0) {
      throw new Error('The optimized contribution overlay is empty.');
    }
    return { svg, filledCellCount, removedAnimationCount: 0 };
  }

  const colorByClass = new Map();
  const cellAnimationPattern =
    /@keyframes (c[0-9a-z]+)\{.*?\}\.c\.\1\{fill:var\(--c([1-4])\);animation-name:\1\}/gs;
  let removedAnimationCount = 0;
  let optimized = svg.replace(
    cellAnimationPattern,
    (_animation, className, level) => {
      colorByClass.set(className, level);
      removedAnimationCount += 1;
      return '';
    },
  );

  optimized = optimized.replace(
    /<rect class="c (c[0-9a-z]+)"/g,
    (elementStart, className) => {
      const level = colorByClass.get(className);

      if (!level) {
        throw new Error(`Could not determine the color for contribution cell ${className}.`);
      }
      return `<rect class="c l${level}"`;
    },
  );
  optimized = optimized.replace(/;animation:none \d+ms linear infinite/, '');
  optimized = optimized
    .replace(
      /\.c\.l1\{fill:var\(--c1\)\}\.c\.l2\{fill:var\(--c2\)\}\.c\.l3\{fill:var\(--c3\)\}\.c\.l4\{fill:var\(--c4\)\}@keyframes eat\{.*?\}\.e\{.*?\}/s,
      '',
    )
    .replace(
      /<defs id="eaten-animation">.*?<\/defs><path class="e"[^>]*\/>/s,
      '',
    );

  const filledCells = [
    ...optimized.matchAll(
      /<rect class="c l([1-4])" x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*\/>/g,
    ),
  ];

  if (filledCells.length === 0) {
    throw new Error('Could not find colored contribution cells.');
  }
  if (removedAnimationCount > 0 && removedAnimationCount !== filledCells.length) {
    throw new Error('Not all contribution cell animations were converted.');
  }

  const coloredCells = filledCells.map((cell) => cell[0]).join('');
  optimized = optimized.replace(
    /<rect class="c l[1-4]"/g,
    '<rect class="c"',
  );

  const turns = [path[0]];

  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];

    if (
      current.x - previous.x !== next.x - current.x ||
      current.y - previous.y !== next.y - current.y
    ) {
      turns.push(current);
    }
  }
  turns.push(path.at(-1));

  const pathLength = path.slice(1).reduce((length, position, index) => {
    const previous = path[index];
    return length + Math.hypot(position.x - previous.x, position.y - previous.y);
  }, 0);
  const centerOffset = 2 + cellWidth / 2;
  const pathData = turns
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? 'M' : 'L'}${formatNumber(x + centerOffset)} ${formatNumber(y + centerOffset)}`,
    )
    .join(' ');
  const levelStyles = [1, 2, 3, 4]
    .map((level) => `.c.l${level}{fill:var(--c${level})}`)
    .join('');
  const eaterStyle = `${levelStyles}@keyframes eat{0%{stroke-dashoffset:${formatNumber(pathLength)}}100%{stroke-dashoffset:0}}.e{fill:none;stroke:#000;stroke-width:${formatNumber(cellWidth + 2)}px;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:${formatNumber(pathLength)} ${formatNumber(pathLength)};stroke-dashoffset:${formatNumber(pathLength)};animation:eat ${durationMs}ms linear infinite}`;
  const eaterElements = `<defs id="cell-consumption-animation"><mask id="remaining-cells" maskUnits="userSpaceOnUse" x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" style="mask-type:luminance"><rect x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="#fff"/><path class="e" d="${pathData}"/></mask></defs><g id="colored-cells" mask="url(#remaining-cells)">${coloredCells}</g>`;

  if (!/\.s\{/.test(optimized) || !/<rect class="s s0"/.test(optimized)) {
    throw new Error('Could not insert the optimized cell-consumption path.');
  }

  optimized = optimized
    .replace(/(?=\.s\{)/, eaterStyle)
    .replace(/(?=<rect class="s s0")/, eaterElements);

  return {
    svg: optimized,
    filledCellCount: filledCells.length,
    removedAnimationCount,
  };
};

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
  const stepX = getGridStep(xValues);
  const stepY = getGridStep(yValues);
  const padding = 2;
  const minX = Math.min(...xValues) - padding;
  const minY = Math.min(...yValues) - padding;
  const maxX = Math.max(...xValues) + cellWidth + padding;
  const maxY = Math.max(...yValues) + cellHeight + padding;
  const minSnakeX = minX;
  const minSnakeY = minY;
  const maxSnakeX = Math.max(...xValues) - padding;
  const maxSnakeY = Math.max(...yValues) - padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const root = `<svg viewBox="${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}" width="${formatNumber(width)}" height="${formatNumber(height)}" overflow="hidden"`;
  const rootPattern =
    /^<svg viewBox="[^"]+" width="[^"]+" height="[^"]+"(?: overflow="[^"]+")?/;

  if (!rootPattern.test(svg)) {
    throw new Error(`Could not update the SVG viewport in ${file}.`);
  }

  const cropped = svg.replace(rootPattern, root);
  let transformCount = 0;
  let constrainedTransformCount = 0;
  const constrained = cropped.replace(
    /transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\)/g,
    (_transform, rawX, rawY) => {
      transformCount += 1;
      const x = Number(rawX);
      const y = Number(rawY);
      const constrainedX = clamp(x, minSnakeX, maxSnakeX);
      const constrainedY = clamp(y, minSnakeY, maxSnakeY);

      if (constrainedX !== x || constrainedY !== y) {
        constrainedTransformCount += 1;
      }

      return `transform:translate(${formatNumber(constrainedX)}px,${formatNumber(constrainedY)}px)`;
    },
  );

  if (transformCount === 0) {
    throw new Error(`Could not find the snake animation transforms in ${file}.`);
  }

  const progress = removeHiddenProgressAnimation(constrained);
  const smoothed = smoothSnakeAnimations(progress.svg, stepX, stepY);
  const optimized = replaceCellAnimationsWithPath(
    smoothed.svg,
    smoothed.path,
    smoothed.edgeCount,
    smoothed.durationMs,
    cellWidth,
    width,
    height,
  );

  if (optimized.svg !== svg) {
    await writeFile(file, optimized.svg);
  }
  console.log(
    `Constrained ${file} to ${formatNumber(width)}×${formatNumber(height)}; updated ${constrainedTransformCount} positions, removed ${progress.removedCount} hidden progress elements and ${optimized.removedAnimationCount} cell animations, smoothed ${smoothed.edgeCount} steps into ${smoothed.keyframeCount} keyframes over ${smoothed.durationMs}ms, and routed ${optimized.filledCellCount} colored cells through one consumption path.`,
  );
}
