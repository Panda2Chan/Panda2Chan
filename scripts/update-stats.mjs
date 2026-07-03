import fs from "node:fs/promises";
import path from "node:path";

const username = process.env.GITHUB_USERNAME || "Panda2Chan";
const token = process.env.GITHUB_TOKEN;
const rootDir = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(rootDir, "assets");

const languageColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Vue: "#41b883",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Go: "#00add8",
  Python: "#3572A5",
  Shell: "#89e051",
  MDX: "#fcb32c",
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function fetchRepos() {
  const repos = [];

  for (let page = 1; page <= 10; page += 1) {
    const batch = await fetchJson(
      `https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated&page=${page}`,
    );

    repos.push(...batch);
    if (batch.length < 100) break;
  }

  return repos;
}

async function fetchLanguageStats(repos) {
  const totals = new Map();

  for (const repo of repos) {
    if (repo.fork) continue;

    try {
      const languages = await fetchJson(repo.languages_url);
      for (const [name, bytes] of Object.entries(languages)) {
        totals.set(name, (totals.get(name) || 0) + bytes);
      }
    } catch {
      if (repo.language) {
        totals.set(repo.language, (totals.get(repo.language) || 0) + 1);
      }
    }
  }

  const totalBytes = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: totalBytes > 0 ? Math.round((bytes / totalBytes) * 1000) / 10 : 0,
      color: languageColors[name] || "#8b949e",
    }));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

function statRow(label, value, y) {
  return `
    <text x="28" y="${y}" class="label">${escapeXml(label)}</text>
    <text x="372" y="${y}" class="value" text-anchor="end">${escapeXml(value)}</text>`;
}

function statsSvg({ profile, repos }) {
  const sourceRepos = repos.filter((repo) => !repo.fork);
  const stars = sourceRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const forks = sourceRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const latest = sourceRepos[0]?.updated_at || profile.updated_at;

  return `<svg width="400" height="165" viewBox="0 0 400 165" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} GitHub stats</title>
  <desc id="desc">GitHub profile statistics generated from GitHub API.</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #f0f6fc; font: 700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .label { fill: #8b949e; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .value { fill: #58a6ff; font: 700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .muted { fill: #8b949e; font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="399" height="164" rx="10" />
  <text x="24" y="34" class="title">${escapeXml(username)}'s GitHub</text>
  ${statRow("Public repositories", profile.public_repos, 64)}
  ${statRow("Original repositories", sourceRepos.length, 88)}
  ${statRow("Stars received", stars, 112)}
  ${statRow("Forks received", forks, 136)}
  <text x="24" y="153" class="muted">Updated ${escapeXml(formatDate(latest))}</text>
</svg>
`;
}

function languageRow(item, index) {
  const y = 62 + index * 18;
  const width = Math.max(4, Math.round(item.percent * 2.2));

  return `
    <circle cx="30" cy="${y - 4}" r="4" fill="${item.color}" />
    <text x="42" y="${y}" class="name">${escapeXml(item.name)}</text>
    <rect x="150" y="${y - 11}" width="220" height="8" rx="4" fill="#21262d" />
    <rect x="150" y="${y - 11}" width="${width}" height="8" rx="4" fill="${item.color}" />
    <text x="372" y="${y}" class="percent" text-anchor="end">${item.percent}%</text>`;
}

function languagesSvg(languages) {
  const rows = languages.map(languageRow).join("");

  return `<svg width="400" height="165" viewBox="0 0 400 165" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} top languages</title>
  <desc id="desc">Top programming languages generated from public source repositories.</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #f0f6fc; font: 700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .name { fill: #c9d1d9; font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .percent { fill: #8b949e; font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .muted { fill: #8b949e; font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="399" height="164" rx="10" />
  <text x="24" y="34" class="title">Top Languages</text>
  ${rows}
  <text x="24" y="153" class="muted">Public source repositories only</text>
</svg>
`;
}

async function main() {
  const [profile, repos] = await Promise.all([
    fetchJson(`https://api.github.com/users/${username}`),
    fetchRepos(),
  ]);
  const languages = await fetchLanguageStats(repos);

  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, "github-stats.svg"), statsSvg({ profile, repos }));
  await fs.writeFile(path.join(assetsDir, "top-langs.svg"), languagesSvg(languages));

  console.log(`Generated stats for ${username}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
