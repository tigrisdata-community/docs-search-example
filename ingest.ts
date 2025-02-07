import "dotenv/config";

import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry, register } from "@lancedb/lancedb/embedding";
import { EmbeddingFunction } from "@lancedb/lancedb/embedding";
import { Float32, Utf8 } from "apache-arrow";
import { execa } from "execa";
import { glob } from "glob";
import { readFile } from "node:fs/promises";
import matter from "gray-matter";

await execa("sh", ["-c", "cd var/tigris-blog && git pull"]);
await execa("sh", ["-c", "cd var/tigris-os-docs && git pull"]);

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
  const markdownFiles = await glob("./var/**/*.md");
  const mdxFiles = await glob("./var/**/*.mdx");

  const files = [...markdownFiles, ...mdxFiles].filter(
    (fname) => !fname.endsWith("README.md")
  );
  files.sort();

  // const files = ["var/tigris-blog/blog/2024-11-05-storage-tiers/index.mdx"];

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
      url = `https://tigrisdata.com/${sourceOf(fname)}/${
        frontMatter.data.slug
      }`;
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
      .map((p) => p.trim())
      .filter((p) => !p.startsWith("#"))
      .filter((p) => !p.startsWith("---"))
      .filter((p) => !p.startsWith("<"))
      .filter((p) => !p.startsWith("import"))
      .filter((p) => p !== "")
      .filter((p) => p.length <= 4000);

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

const db = await lancedb.connect("s3://xe-stream-lancedb/docs", {
  storageOptions: {
    endpoint: "https://fly.storage.tigris.dev",
    region: "auto",
  },
});

const func = getRegistry()
  .get("openai")
  ?.create({ model: "text-embedding-3-small" }) as EmbeddingFunction;

const contentSchema = LanceSchema({
  text: func.sourceField(new Utf8()),
  vector: func.vectorField(),
  title: new Utf8(),
  url: new Utf8(),
});

const tbl = await db.createEmptyTable("content", contentSchema, {
  mode: "overwrite",
});

const utterances = await loadFiles();
let docs: unknown = [];

for (const utterance of utterances) {
  for (const paragraph of utterance.paragraphs) {
    const doc = {
      text: paragraph,
      title: utterance.title,
      url: utterance.url,
    };

    docs.push(doc);

    if (docs.length >= 50) {
      const titles = docs.map((doc) => doc.title).join(" - ");
      console.log(`Adding ${docs.length} docs: ${titles}`);
      await tbl.add(docs);
      docs = [];
    }
  }
}

if (docs.length !== 0) {
  const titles = docs.map((doc) => doc.title).join(" - ");
  console.log(`Adding ${docs.length} docs: ${titles}`);
  await tbl.add(docs);
}

// await tbl.add([{ text: "hello world" }, { text: "goodbye world" }]);

await tbl.createIndex("vector");

const query = "S3";

const actual = (await tbl.search(query).limit(1).toArray())[0];
console.log(actual.url);
