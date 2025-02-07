import "dotenv/config";
import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry } from "@lancedb/lancedb/embedding";
import { Utf8 } from "apache-arrow";
import express from "express";
import remarkHtml from 'remark-html';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const db = await lancedb.connect(`s3://${process.env.BUCKET_NAME}/docs`, {
  storageOptions: {
    endpoint: "https://fly.storage.tigris.dev",
    region: "auto",
  },
});

const func = getRegistry()
  .get("openai")
  ?.create({ model: "text-embedding-3-small" });

const contentSchema = LanceSchema({
  text: func.sourceField(new Utf8()),
  vector: func.vectorField(),
  title: new Utf8(),
  url: new Utf8(),
});

const tbl = await db.openTable("content", contentSchema);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("static"));

app.set("view engine", "pug");

app.get("/", async (req, res) => {
  const query = req.query.q;
  console.log(`Searching for ${query}...`);
  if (!query) {
    res.render("search", { title: "Search" });
    return;
  }

  const actual = await tbl.search(query).limit(25).toArray();
  console.log(`found ${actual.length} results`);

  const results = [];

  for (const result of actual) {
    results.push({
      title: result.title,
      url: result.url,
      text: (await unified()
        .use(remarkParse)
        .use(remarkHtml)
        .process(result.text)
      ).toString(),
    })
  }

  res.render("search_results", {
    title: "Search Results",
    query,
    results,
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});