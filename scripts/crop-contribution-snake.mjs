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

const getHeadVisits = (svg, stepX, stepY) => {
  const frames = getSnakeFrames(svg, 0);

  const visits = new Map();
  const recordVisit = (x, y, time) => {
    const key = `${formatNumber(x)},${formatNumber(y)}`;
    const previous = visits.get(key);

    if (previous === undefined || time < previous) {
      visits.set(key, time);
    }
  };

  for (let index = 0; index < frames.length; index += 1) {
    const start = frames[index];
    const end = frames[index + 1];
    recordVisit(start.x, start.y, start.time);

    if (!end || (start.x === end.x && start.y === end.y)) {
      continue;
    }

    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;

    if (deltaX !== 0 && deltaY !== 0) {
      throw new Error('The constrained snake path contains a diagonal move.');
    }

    const steps = Math.abs(deltaX / stepX) + Math.abs(deltaY / stepY);

    if (!Number.isInteger(steps)) {
      throw new Error('The constrained snake path is not aligned to the contribution grid.');
    }

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      recordVisit(
        start.x + deltaX * progress,
        start.y + deltaY * progress,
        start.time + (end.time - start.time) * progress,
      );
    }
  }

  return visits;
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

  return { svg: smoothed, edgeCount, durationMs, keyframeCount };
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

const synchronizeCellAnimations = (svg, filledCells, visits, padding) => {
  let synchronized = svg;
  let changedCount = 0;

  for (const cell of filledCells) {
    const className = cell[1];
    const x = Number(cell[2]) - padding;
    const y = Number(cell[3]) - padding;
    const visitTime = visits.get(`${formatNumber(x)},${formatNumber(y)}`);

    if (visitTime === undefined) {
      throw new Error(`The snake never reaches contribution cell ${className}.`);
    }

    const animationPattern = new RegExp(
      `@keyframes ${className}\\{[\\d.]+%\\{fill:var\\((--c[1-4])\\)\\}[\\d.]+%,100%\\{fill:var\\(--ce\\)\\}\\}`,
    );
    const animation = synchronized.match(animationPattern);

    if (!animation) {
      throw new Error(`Could not find the animation for contribution cell ${className}.`);
    }

    const beforeVisit = Math.max(0, Math.min(99.98, visitTime - 0.01));
    const afterVisit = Math.max(
      beforeVisit + 0.01,
      Math.min(99.99, visitTime + 0.01),
    );
    const replacement = `@keyframes ${className}{${formatNumber(beforeVisit)}%{fill:var(${animation[1]})}${formatNumber(afterVisit)}%,100%{fill:var(--ce)}}`;

    if (animation[0] !== replacement) {
      synchronized = synchronized.replace(animationPattern, replacement);
      changedCount += 1;
    }
  }

  return { svg: synchronized, changedCount };
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
  const filledCells = [
    ...smoothed.svg.matchAll(
      /<rect class="c (c[0-9a-z]+)" x="(-?[\d.]+)" y="(-?[\d.]+)"/g,
    ),
  ];
  const visits = getHeadVisits(smoothed.svg, stepX, stepY);
  const synchronized = synchronizeCellAnimations(
    smoothed.svg,
    filledCells,
    visits,
    padding,
  );

  if (synchronized.svg !== svg) {
    await writeFile(file, synchronized.svg);
  }
  console.log(
    `Constrained ${file} to ${formatNumber(width)}×${formatNumber(height)}; updated ${constrainedTransformCount} positions, removed ${progress.removedCount} hidden progress elements, smoothed ${smoothed.edgeCount} steps into ${smoothed.keyframeCount} keyframes over ${smoothed.durationMs}ms, and synchronized ${synchronized.changedCount} contribution cells.`,
  );
}
