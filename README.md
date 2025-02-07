# docs-search-example

Search through the Tigris documentation and blog with the power of AI!

## Setup

Clone the docs and blog repos.

```text
cd var
git clone https://github.com/tigrisdata/tigris-blog
git clone https://github.com/tigrisdata/tigris-os-docs
```

### Ingesting data to lancedb

```text
node ingest.ts
```

### Searching docs in lancedb

```js
import * as lancedb from "@lancedb/lancedb";
import "@lancedb/lancedb/embedding/openai";
import { LanceSchema, getRegistry } from "@lancedb/lancedb/embedding";
import { Utf8 } from "apache-arrow";

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

const query = magic_get_query_somehow(); // fill this in

const actual = await tbl.search(query).limit(25).toArray();
console.log(`found ${actual.length} results:`);

for (const result of actual) {
  console.log(`* ${result.title}: ${result.url}\n${result.text}\n`);
}
```

### Running the app

Envvars you need:

| Name                    | Description                                                                                 |
| :---------------------- | :------------------------------------------------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | Tigris access key ID                                                                        |
| `AWS_SECRET_ACCESS_KEY` | Tigris secret access key                                                                    |
| `BUCKET_NAME`           | `xe-stream-lancedb`                                                                         |
| `OPENAI_API_KEY`        | API key for the OpenAI API (needed for generating embeddings with `text-embedding-3-small`) |

Put them in `.env`.

Install the dependencies:

```text
npm install
```

Run the server:

```text
node index.js
```
