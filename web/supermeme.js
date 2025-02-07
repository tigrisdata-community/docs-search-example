

export default class SupermemeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async textToMeme(prompt) {
    const resp = await fetch(
      "https://app.supermeme.ai/api/v2/meme/image",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "text": prompt,
        }),
      },
    )
      .then(resp => {
        if (resp.status !== 200) {
          throw new Error(`Failed to create meme: ${resp.status} ${resp.statusText}`);
        }

        return resp;
      })
      .then(resp => resp.json());

    return resp;
  }
}