import "dotenv/config";
import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry } from "@lancedb/lancedb/embedding";
import { Utf8 } from "apache-arrow";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import express from "express";
import remarkHtml from 'remark-html';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { loadFiles } from "./utterances.js";

import SupermemeClient from "./web/supermeme.js";
import { tableFromArrays } from "apache-arrow";

const openai = new OpenAI();
const model = process.env.OPENAI_MODEL || "gpt-4o";
const memegen = new SupermemeClient(process.env.SUPERMEME_API_KEY);

const db = await lancedb.connect("s3://xe-stream-lancedb/docs", {
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

const Meme = z.object({
  topText: z.string(),
  bottomText: z.string(),
  // templateName: z.string(),
});

const utterances = await loadFiles();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("static"));

app.set("view engine", "pug");

const getRandomPage = () => {
  return utterances[Math.floor(Math.random() * utterances.length)];
};

const getRandomParagraph = (page) => {
  let result = page.paragraphs[Math.floor(Math.random() * page.paragraphs.length)];
  return result;
};

const getMemes = async ({ title, url, paragraph }) => {
  const input = {
    title,
    url,
    paragraph,
  };

  console.log(`Generating meme for ${input.title}...`);

  const completion = await openai.beta.chat.completions.parse({
    model,
    messages: [
      {
        role: "user",
        content: "You are an expert meme author well known for making the dankest memes of all time, with a preference for obscure memes. Be uplifting and positive. Given the title of the page and contents of a random paragraph, construct a meme prompt and reference the template by name.\n\n" + JSON.stringify({ title, paragraph }),
      },
    ],
    store: true,
    response_format: zodResponseFormat(Meme, "meme"),
  });

  const meme = completion.choices[0].message.parsed;
  console.log(meme);
  const memeResp = await memegen.textToMeme(`${input.title} ${meme.topText} ${meme.bottomText}`);
  // console.log(memeResp);

  return {
    "title": input.title,
    "url": input.url,
    "memes": memeResp.memes,
  };
};

app.get("/", (req, res) => {
  res.render("index", { title: "Hey", message: "Hello there!" });
});

app.get("/meme", async (req, res) => {
  const memes = await getMemes();
  res.render("meme", memes);
});

app.get("/turbomeme", async (req, res) => {
  const query = req.query.q;
  console.log(`Searching for ${query}...`);
  if (!query) {
    res.text("No query provided, add ?q=your+query to the URL");
    return;
  }

  const actual = await tbl.search(query).limit(25).toArray();
  // shuffle actual
  actual.sort(() => Math.random() - 0.5);
  const page = actual[0];

  const memes = await getMemes({
    title: page.title,
    url: page.url,
    paragraph: page.text,
  });

  res.render("meme", memes);
});

app.get("/search", async (req, res) => {
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