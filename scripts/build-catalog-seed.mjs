import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const setsPath = join(repoRoot, "sets.csv", "sets.csv");
const themesPath = join(repoRoot, "themes.csv", "themes.csv");
const outputPath = join(
  repoRoot,
  "supabase",
  "migrations",
  "202608260003_seed_product_catalog.sql",
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some(Boolean))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''").replaceAll("\0", "")}'`;
}

const themes = parseCsv(readFileSync(themesPath, "utf8"));
const sets = parseCsv(readFileSync(setsPath, "utf8"));
const years = [2024, 2025, 2026];

const selected = years.flatMap((year) =>
  sets
    .filter(
      (set) =>
        Number(set.year) === year &&
        set.img_url &&
        Number(set.num_parts) >= 50,
    )
    .sort((left, right) => Number(right.num_parts) - Number(left.num_parts))
    .slice(0, 200),
);

if (selected.length !== 600) {
  throw new Error(`Expected 600 selected products, found ${selected.length}.`);
}

const featured = new Set(
  years.flatMap((year) =>
    selected
      .filter((set) => Number(set.year) === year)
      .slice(0, 16)
      .map((set) => set.set_num),
  ),
);

const themeValues = themes.map((theme) =>
  `  (${Number(theme.id)}, ${sqlText(theme.name)}, ${theme.parent_id ? Number(theme.parent_id) : "null"})`,
);

const setValues = selected.map((set, index) => {
  const sourceUrl = `https://rebrickable.com/sets/${encodeURIComponent(set.set_num)}/`;
  return `  (${sqlText(set.set_num)}, ${sqlText(set.name)}, ${Number(set.year)}, ${Number(set.theme_id)}, ${Number(set.num_parts)}, ${sqlText(set.img_url)}, 'Rebrickable', ${sqlText(sourceUrl)}, ${featured.has(set.set_num)}, true, ${index + 1})`;
});

const sql = `-- Generated from the downloaded Rebrickable themes.csv and sets.csv files.
-- Selection: 200 image-backed sets with at least 50 parts from each of 2024, 2025, and 2026.

insert into public.lego_themes (id, name, parent_id)
values
${themeValues.join(",\n")}
on conflict (id) do update
set name = excluded.name,
    parent_id = excluded.parent_id;

insert into public.lego_sets (
  set_num,
  name,
  year,
  theme_id,
  num_parts,
  image_url,
  source_name,
  source_url,
  is_featured,
  is_visible,
  display_order
)
values
${setValues.join(",\n")}
on conflict (set_num) do update
set name = excluded.name,
    year = excluded.year,
    theme_id = excluded.theme_id,
    num_parts = excluded.num_parts,
    image_url = excluded.image_url,
    source_name = excluded.source_name,
    source_url = excluded.source_url;
`;

writeFileSync(outputPath, sql, "utf8");
console.log(`Wrote ${selected.length} products and ${themes.length} themes to ${outputPath}.`);
