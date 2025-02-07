import { execa } from "execa";
import { glob } from "glob";
import { readFile } from "node:fs/promises";
import matter from "gray-matter";

const update = async () => {
  await execa("sh", ["-c", "cd var/tigris-blog && git pull"]);
  await execa("sh", ["-c", "cd var/tigris-os-docs && git pull"]);
};

const sourceOf = (fname) => {
  // var/tigris-blog/2021-09-01-announcing-tigris.md -> blog
  // var/tigris-os-docs/2021-09-01-announcing-tigris.md -> docs
  const parts = fname.split("/");
  const source = parts[1];

  if (source === "tigris-blog") {
    return "blog";
  } else if (source === "tigris-os-docs") {
    return "docs";
  }

  return "unknown";
};

export const loadFiles = async () => {
  await update();

  const markdownFiles = await glob("./var/**/*.md");
  const mdxFiles = await glob("./var/**/*.mdx");

  const files = [...markdownFiles, ...mdxFiles]
    .filter(fname => !fname.endsWith("README.md"));
  files.sort();

  const utterances = [];

  for (const fname of files) {
    const data = await readFile(fname, "utf-8");

    const frontMatter = matter(data);

    let title = "";
    let url = "";

    if (frontMatter.data && frontMatter.data.title) {
      title = frontMatter.data.title;
    } else {
      const firstLine = data.split("\n")[0];
      title = firstLine.substring(2);
    }

    if (frontMatter.data && frontMatter.data.slug) {
      url = `https://tigrisdata.com/${sourceOf(fname)}/${frontMatter.data.slug}`;
    } else {
      // var/tigris-os-docs/docs/buckets/object-notifications.md -> buckets/object-notifications
      // var/tigris-os-docs/docs/buckets/object-notifications.mdx -> buckets/object-notifications
      const parts = fname.split("/");
      const path = parts.slice(2).join("/");
      const slug = path.replace(".mdx", "").replace(".md", "");
      url = `https://tigrisdata.com/${slug}`;
    }

    const paragraphs = data
      .split("\n\n")
      .map(p => p.trim())
      .filter(p => p !== undefined)
      .filter(p => !p.startsWith("|"))
      .filter(p => !p.startsWith("```"))
      .filter(p => !p.endsWith("```"))
      .filter(p => !p.startsWith("<"))
      .filter(p => !p.startsWith("---"))
      .filter(p => p.length > 250);

    if (paragraphs.length === 0) {
      continue;
    }

    utterances.push({
      fname,
      title,
      url,
      paragraphs,
    });
  }

  return utterances;
};